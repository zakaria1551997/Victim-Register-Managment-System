/**
 * Core business rules, RBAC permissions, workflow state machine,
 * 13-column validation, and Bengali formatting utilities for
 * জখমী রেজিস্টার ব্যবস্থাপনা সিস্টেম (Injury Register Management System)
 */

export type UserRoleCode =
  | 'SYSTEM_ADMIN'
  | 'DATA_ENTRY_OPERATOR'
  | 'VERIFIER'
  | 'APPROVER'
  | 'DOCTOR'
  | 'REPORT_USER';

export type WorkflowStatus =
  | 'DRAFT'
  | 'PENDING_VERIFICATION'
  | 'RETURNED_FOR_CORRECTION'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED';

export type CompletionStatus = 'COMPLETE' | 'INCOMPLETE';

export type PermissionCode =
  | 'RECORD_VIEW'
  | 'RECORD_CREATE'
  | 'RECORD_EDIT_OWN_DRAFT'
  | 'RECORD_EDIT_ANY'
  | 'RECORD_EDIT_APPROVED'
  | 'RECORD_DELETE'
  | 'RECORD_SUBMIT'
  | 'RECORD_VERIFY'
  | 'RECORD_APPROVE'
  | 'LEGAL_VIEW'
  | 'LEGAL_EDIT'
  | 'ATTACHMENT_VIEW'
  | 'ATTACHMENT_UPLOAD'
  | 'ATTACHMENT_DELETE'
  | 'REPORT_VIEW'
  | 'REPORT_PRINT'
  | 'AUDIT_VIEW'
  | 'USER_MANAGE'
  | 'BACKUP_MANAGE';

export const ROLE_LABELS_BN: Record<UserRoleCode, string> = {
  SYSTEM_ADMIN: 'সিস্টেম অ্যাডমিন (System Admin)',
  DATA_ENTRY_OPERATOR: 'ডাটা এন্ট্রি অপারেটর (Data Entry Operator)',
  VERIFIER: 'যাচাইকারী কর্মকর্তা (Verifier)',
  APPROVER: 'অনুমোদনকারী কর্তৃপক্ষ (Approver)',
  DOCTOR: 'চিকিৎসক / মেডিকেল অফিসার (Doctor)',
  REPORT_USER: 'রিপোর্ট ভিউয়ার (Report User)',
};

export const WORKFLOW_STATUS_LABELS_BN: Record<WorkflowStatus, string> = {
  DRAFT: 'খসড়া',
  PENDING_VERIFICATION: 'যাচাইয়ের অপেক্ষায়',
  RETURNED_FOR_CORRECTION: 'সংশোধনের জন্য ফেরত',
  PENDING_APPROVAL: 'অনুমোদনের অপেক্ষায়',
  APPROVED: 'অনুমোদিত',
  REJECTED: 'প্রত্যাখ্যাত',
};

export const COMPLETION_STATUS_LABELS_BN: Record<CompletionStatus, string> = {
  COMPLETE: 'সম্পূর্ণ',
  INCOMPLETE: 'অসম্পূর্ণ',
};

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRoleCode, PermissionCode[]> = {
  SYSTEM_ADMIN: [
    'RECORD_VIEW',
    'RECORD_CREATE',
    'RECORD_EDIT_OWN_DRAFT',
    'RECORD_EDIT_ANY',
    'RECORD_EDIT_APPROVED',
    'RECORD_DELETE',
    'RECORD_SUBMIT',
    'RECORD_VERIFY',
    'RECORD_APPROVE',
    'LEGAL_VIEW',
    'LEGAL_EDIT',
    'ATTACHMENT_VIEW',
    'ATTACHMENT_UPLOAD',
    'ATTACHMENT_DELETE',
    'REPORT_VIEW',
    'REPORT_PRINT',
    'AUDIT_VIEW',
    'USER_MANAGE',
    'BACKUP_MANAGE',
  ],
  DATA_ENTRY_OPERATOR: [
    'RECORD_VIEW',
    'RECORD_CREATE',
    'RECORD_EDIT_OWN_DRAFT',
    'RECORD_DELETE',
    'RECORD_SUBMIT',
    'LEGAL_VIEW',
    'LEGAL_EDIT',
    'ATTACHMENT_VIEW',
    'ATTACHMENT_UPLOAD',
    'REPORT_VIEW',
    'REPORT_PRINT',
  ],
  VERIFIER: [
    'RECORD_VIEW',
    'RECORD_VERIFY',
    'RECORD_EDIT_ANY',
    'LEGAL_VIEW',
    'LEGAL_EDIT',
    'ATTACHMENT_VIEW',
    'ATTACHMENT_UPLOAD',
    'REPORT_VIEW',
    'REPORT_PRINT',
    'AUDIT_VIEW',
  ],
  APPROVER: [
    'RECORD_VIEW',
    'RECORD_VERIFY',
    'RECORD_APPROVE',
    'RECORD_EDIT_APPROVED',
    'LEGAL_VIEW',
    'ATTACHMENT_VIEW',
    'REPORT_VIEW',
    'REPORT_PRINT',
    'AUDIT_VIEW',
  ],
  DOCTOR: [
    'RECORD_VIEW',
    'RECORD_CREATE',
    'RECORD_EDIT_OWN_DRAFT',
    'RECORD_SUBMIT',
    'LEGAL_VIEW',
    'ATTACHMENT_VIEW',
    'ATTACHMENT_UPLOAD',
    'REPORT_VIEW',
    'REPORT_PRINT',
  ],
  REPORT_USER: [
    'RECORD_VIEW',
    'REPORT_VIEW',
    'REPORT_PRINT',
  ],
};

const EN_TO_BN_DIGITS: Record<string, string> = {
  '0': '০',
  '1': '১',
  '2': '২',
  '3': '৩',
  '4': '৪',
  '5': '৫',
  '6': '৬',
  '7': '৭',
  '8': '৮',
  '9': '৯',
};

const BN_TO_EN_DIGITS: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

export function toBengaliDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[0-9]/g, (d) => EN_TO_BN_DIGITS[d] || d);
}

export function toEnglishDigits(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).replace(/[০-৯]/g, (d) => BN_TO_EN_DIGITS[d] || d);
}

/**
 * Normalizes manual registration number for duplicate detection
 * Converts Bengali digits to English, trims spaces, uppercases Latin chars.
 */
export function normalizeRegNo(regNo: string): string {
  return toEnglishDigits(regNo).trim().replace(/\s+/g, '').toUpperCase();
}

/**
 * Formats YYYY-MM-DD into DD/MM/YYYY (optionally in Bengali digits)
 */
export function formatDisplayDate(isoDate: string | null | undefined, useBengali = false): string {
  if (!isoDate) return '—';
  const trimmed = isoDate.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!match) {
    return useBengali ? toBengaliDigits(trimmed) : trimmed;
  }
  const formatted = `${match[3]}/${match[2]}/${match[1]}`;
  return useBengali ? toBengaliDigits(formatted) : formatted;
}

export interface InjuryRecordInput {
  // Column 1: রেজি: নং ও তারিখ (separate fields as required)
  registrationNo: string;
  registrationDate: string;
  // Column 2: জখমীর নাম, বয়স, পিতার ও ঠিকানা
  injuredName: string;
  injuredAge: string;
  fatherOrGuardianName: string;
  injuredAddress: string;
  // Column 3: চিকিৎসকের নাম/এন্ট্রি পাচ্ছি না
  doctorName: string;
  doctorDesignation?: string;
  doctorEntryNotFound?: boolean;
  // Column 4: অতিরিক্ত রেজি: নং ও তারিখ
  additionalRegNo?: string;
  additionalRegDate?: string;
  // Column 5: অত্র প্রতিষ্ঠানের স্মারক নম্বর ও তারিখ
  signatureNo?: string;
  signatureDate?: string;
  // Column 6: থানার মামলা নম্বর ও তারিখ/কোর্টের মামলা নম্বর ও তারিখ
  policeStationName?: string;
  policeCaseNo?: string;
  policeCaseDate?: string;
  courtCaseNo?: string;
  courtCaseDate?: string;
  // Column 7: এমসি প্রেরণের তারিখ
  mcDispatchDate?: string;
  // Column 8: কি কি পরীক্ষা রিপোর্ট লাগবে
  requiredTestReports?: string;
  // Column 9: সুপারিশকারী যদি থাকে
  recommenderInfo?: string;
  // Column 10 & 11 notes/labels (attachments stored in attachments table + notes)
  applicationAttachmentNote?: string;
  otherAttachmentNote?: string;
  entryBookAttachmentNote?: string;
  // Column 12: মন্তব্য
  remarks?: string;
  // Column 13: সম্পূর্ণ/অসম্পূর্ণ
  completionStatus: CompletionStatus;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateInjuryRecordInput(
  input: Partial<InjuryRecordInput>,
  isDraft = false
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.registrationNo || !input.registrationNo.trim()) {
    errors.registrationNo = 'রেজিস্ট্রেশন নম্বর প্রদান করা আবশ্যক।';
  }

  if (!input.registrationDate || !input.registrationDate.trim()) {
    errors.registrationDate = 'রেজিস্ট্রেশনের তারিখ প্রদান করা আবশ্যক।';
  }

  if (!input.injuredName || !input.injuredName.trim()) {
    errors.injuredName = 'জখমীর নাম প্রদান করা আবশ্যক।';
  }

  if (!isDraft) {
    if (!input.injuredAge || !input.injuredAge.trim()) {
      errors.injuredAge = 'জখমীর বয়স প্রদান করা আবশ্যক।';
    }
    if (!input.fatherOrGuardianName || !input.fatherOrGuardianName.trim()) {
      errors.fatherOrGuardianName = 'পিতা/অভিভাবকের নাম প্রদান করা আবশ্যক।';
    }
    if (!input.injuredAddress || !input.injuredAddress.trim()) {
      errors.injuredAddress = 'জখমীর ঠিকানা প্রদান করা আবশ্যক।';
    }
    if (!input.doctorEntryNotFound && (!input.doctorName || !input.doctorName.trim())) {
      errors.doctorName = 'চিকিৎসকের নাম লিখুন অথবা "এন্ট্রি পাচ্ছি না" নির্বাচন করুন।';
    }
  }

  if (
    input.completionStatus &&
    input.completionStatus !== 'COMPLETE' &&
    input.completionStatus !== 'INCOMPLETE'
  ) {
    errors.completionStatus = 'সম্পূর্ণ/অসম্পূর্ণ অবস্থা সঠিক নয়।';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function checkDuplicateRegistration(
  candidateRegNo: string,
  existingRecords: Array<{ id: string; registrationNo: string }>,
  excludeId?: string
): { isDuplicate: boolean; matchedRecordId?: string; matchedRegNo?: string } {
  const normalizedCandidate = normalizeRegNo(candidateRegNo);
  if (!normalizedCandidate) {
    return { isDuplicate: false };
  }

  for (const record of existingRecords) {
    if (excludeId && record.id === excludeId) continue;
    if (normalizeRegNo(record.registrationNo) === normalizedCandidate) {
      return {
        isDuplicate: true,
        matchedRecordId: record.id,
        matchedRegNo: record.registrationNo,
      };
    }
  }
  return { isDuplicate: false };
}

export function hasPermission(
  role: UserRoleCode,
  permission: PermissionCode,
  customPermissions?: PermissionCode[]
): boolean {
  const perms = customPermissions ?? DEFAULT_ROLE_PERMISSIONS[role] ?? [];
  return perms.includes(permission);
}

export function canTransitionWorkflowStatus(
  currentStatus: WorkflowStatus,
  targetStatus: WorkflowStatus,
  role: UserRoleCode
): { allowed: boolean; reasonBn?: string } {
  if (currentStatus === targetStatus) {
    return { allowed: true };
  }

  // Submitting a draft or returned record for verification
  if (
    (currentStatus === 'DRAFT' || currentStatus === 'RETURNED_FOR_CORRECTION') &&
    targetStatus === 'PENDING_VERIFICATION'
  ) {
    if (hasPermission(role, 'RECORD_SUBMIT')) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reasonBn: 'আপনার রেকর্ড যাচাইয়ের জন্য জমা দেওয়ার অনুমতি নেই।',
    };
  }

  // Verifier actions: move to PENDING_APPROVAL or RETURNED_FOR_CORRECTION
  if (currentStatus === 'PENDING_VERIFICATION') {
    if (targetStatus === 'PENDING_APPROVAL' || targetStatus === 'RETURNED_FOR_CORRECTION') {
      if (hasPermission(role, 'RECORD_VERIFY')) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reasonBn: 'শুধুমাত্র যাচাইকারী (Verifier) বা অনুমোদিত কর্মকর্তা এই ধাপ সম্পন্ন করতে পারবেন।',
      };
    }
  }

  // Approver actions: move from PENDING_APPROVAL to APPROVED, REJECTED, or RETURNED_FOR_CORRECTION
  if (currentStatus === 'PENDING_APPROVAL') {
    if (
      targetStatus === 'APPROVED' ||
      targetStatus === 'REJECTED' ||
      targetStatus === 'RETURNED_FOR_CORRECTION'
    ) {
      if (hasPermission(role, 'RECORD_APPROVE')) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reasonBn: 'শুধুমাত্র অনুমোদনকারী কর্তৃপক্ষ (Approver / System Admin) চূড়ান্ত অনুমোদন দিতে পারবেন।',
      };
    }
  }

  // Editing an already approved record resets it to PENDING_VERIFICATION
  if (currentStatus === 'APPROVED' && targetStatus === 'PENDING_VERIFICATION') {
    if (hasPermission(role, 'RECORD_EDIT_APPROVED')) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reasonBn: 'অনুমোদিত রেকর্ড সংশোধনের জন্য বিশেষ অনুমতি প্রয়োজন।',
    };
  }

  return {
    allowed: false,
    reasonBn: `বর্তমান অবস্থা (${WORKFLOW_STATUS_LABELS_BN[currentStatus]}) থেকে (${WORKFLOW_STATUS_LABELS_BN[targetStatus]})-এ পরিবর্তন অনুমোদিত নয়।`,
  };
}

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateAttachmentMeta(
  fileName: string,
  mimeType: string,
  fileSizeBytes: number
): { valid: boolean; errorBn?: string } {
  if (!fileName || !fileName.trim()) {
    return { valid: false, errorBn: 'ফাইলের নাম সঠিক নয়।' };
  }
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      errorBn: 'শুধুমাত্র PDF, JPG, PNG বা WEBP ফাইল আপলোড করা যাবে।',
    };
  }
  if (fileSizeBytes <= 0 || fileSizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      valid: false,
      errorBn: 'ফাইলের আকার সর্বোচ্চ ৫ মেগাবাইট (5 MB) হতে পারবে।',
    };
  }
  return { valid: true };
}

export function canDeleteUserAccount(params: {
  actorId: string;
  actorRole: UserRoleCode;
  actorPermissions?: PermissionCode[];
  targetUserId: string;
  targetUserRole: UserRoleCode;
  activeAdminCount: number;
}): { allowed: boolean; errorBn?: string } {
  if (!hasPermission(params.actorRole, 'USER_MANAGE', params.actorPermissions)) {
    return {
      allowed: false,
      errorBn: 'নিরাপত্তা বাধা: ব্যবহারকারী ডিলিট করার অনুমতি শুধুমাত্র সিস্টেম অ্যাডমিনের রয়েছে।',
    };
  }

  if (params.actorId === params.targetUserId) {
    return {
      allowed: false,
      errorBn: 'নিরাপত্তা নিয়ম: নিজের লগইনকৃত সক্রিয় অ্যাকাউন্ট নিজে ডিলিট করা যাবে না।',
    };
  }

  if (params.targetUserRole === 'SYSTEM_ADMIN' && params.activeAdminCount <= 1) {
    return {
      allowed: false,
      errorBn: 'সিস্টেমের একমাত্র সক্রিয় সিস্টেম অ্যাডমিন অ্যাকাউন্ট ডিলিট করা যাবে না।',
    };
  }

  return { allowed: true };
}

export function canDeleteInjuryRecord(
  role: UserRoleCode,
  customPermissions?: PermissionCode[]
): { allowed: boolean; errorBn?: string } {
  if (
    role === 'SYSTEM_ADMIN' ||
    hasPermission(role, 'RECORD_DELETE', customPermissions) ||
    hasPermission(role, 'RECORD_EDIT_ANY', customPermissions) ||
    hasPermission(role, 'RECORD_CREATE', customPermissions)
  ) {
    return { allowed: true };
  }
  return {
    allowed: false,
    errorBn: 'জখমী রেকর্ড ডিলিট করার অনুমতি আপনার নেই।',
  };
}

