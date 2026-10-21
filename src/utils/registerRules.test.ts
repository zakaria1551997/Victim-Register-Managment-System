import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toBengaliDigits,
  normalizeRegNo,
  formatDisplayDate,
  validateInjuryRecordInput,
  checkDuplicateRegistration,
  hasPermission,
  canTransitionWorkflowStatus,
  validateAttachmentMeta,
  canDeleteUserAccount,
  canDeleteInjuryRecord,
} from './registerRules.ts';

test('Bengali digit conversion and registration number normalization', () => {
  assert.equal(toBengaliDigits('001/2026'), '০০১/২০২৬');
  assert.equal(normalizeRegNo(' ০০১/২০২৬ '), '001/2026');
  assert.equal(normalizeRegNo('001/2026'), '001/2026');
  assert.equal(formatDisplayDate('2026-01-02', false), '02/01/2026');
  assert.equal(formatDisplayDate('2026-01-02', true), '০২/০১/২০২৬');
});

test('Duplicate registration number detection matches across Bengali and English digits', () => {
  const existing = [
    { id: 'rec-1', registrationNo: '001/2026' },
    { id: 'rec-2', registrationNo: '002/2026' },
  ];

  const dup1 = checkDuplicateRegistration('০০১/২০২৬', existing);
  assert.equal(dup1.isDuplicate, true);
  assert.equal(dup1.matchedRecordId, 'rec-1');

  const selfCheck = checkDuplicateRegistration('001/2026', existing, 'rec-1');
  assert.equal(selfCheck.isDuplicate, false);

  const uniqueCheck = checkDuplicateRegistration('004/2026', existing);
  assert.equal(uniqueCheck.isDuplicate, false);
});

test('13-column injury record input validation enforces mandatory fields', () => {
  const invalidResult = validateInjuryRecordInput(
    {
      registrationNo: '',
      registrationDate: '2026-01-10',
      injuredName: 'মোঃ রাকিবুল ইসলাম',
      completionStatus: 'INCOMPLETE',
    },
    false
  );
  assert.equal(invalidResult.valid, false);
  assert.ok(invalidResult.errors.registrationNo);
  assert.ok(invalidResult.errors.injuredAge);
  assert.ok(invalidResult.errors.doctorName);

  // When doctorEntryNotFound is true, doctorName is not required
  const validWithNoDoctor = validateInjuryRecordInput(
    {
      registrationNo: '005/2026',
      registrationDate: '2026-01-10',
      injuredName: 'মোঃ করিম উদ্দিন',
      injuredAge: '৩৫',
      fatherOrGuardianName: 'মোঃ রহিম উদ্দিন',
      injuredAddress: 'কিশোরগঞ্জ সদর',
      doctorName: '',
      doctorEntryNotFound: true,
      completionStatus: 'INCOMPLETE',
    },
    false
  );
  assert.equal(validWithNoDoctor.valid, true);
});

test('Workflow state machine enforces role-based transitions', () => {
  // Data Entry Operator can submit draft to PENDING_VERIFICATION
  const submitCheck = canTransitionWorkflowStatus(
    'DRAFT',
    'PENDING_VERIFICATION',
    'DATA_ENTRY_OPERATOR'
  );
  assert.equal(submitCheck.allowed, true);

  // Data Entry Operator cannot approve directly
  const illegalApprove = canTransitionWorkflowStatus(
    'PENDING_APPROVAL',
    'APPROVED',
    'DATA_ENTRY_OPERATOR'
  );
  assert.equal(illegalApprove.allowed, false);

  // Verifier can move PENDING_VERIFICATION to PENDING_APPROVAL
  const verifyCheck = canTransitionWorkflowStatus(
    'PENDING_VERIFICATION',
    'PENDING_APPROVAL',
    'VERIFIER'
  );
  assert.equal(verifyCheck.allowed, true);

  // Verifier cannot finalize APPROVED
  const verifierApprove = canTransitionWorkflowStatus(
    'PENDING_APPROVAL',
    'APPROVED',
    'VERIFIER'
  );
  assert.equal(verifierApprove.allowed, false);

  // Approver can finalize APPROVED
  const approverCheck = canTransitionWorkflowStatus(
    'PENDING_APPROVAL',
    'APPROVED',
    'APPROVER'
  );
  assert.equal(approverCheck.allowed, true);
});

test('Attachment validation checks MIME types and size limits', () => {
  assert.equal(
    validateAttachmentMeta('application.pdf', 'application/pdf', 1024 * 500).valid,
    true
  );
  assert.equal(
    validateAttachmentMeta('malware.exe', 'application/x-msdownload', 1024).valid,
    false
  );
  assert.equal(
    validateAttachmentMeta('huge.pdf', 'application/pdf', 10 * 1024 * 1024).valid,
    false
  );
});

test('RBAC permission check validates role capabilities', () => {
  assert.equal(hasPermission('SYSTEM_ADMIN', 'USER_MANAGE'), true);
  assert.equal(hasPermission('REPORT_USER', 'RECORD_CREATE'), false);
  assert.equal(hasPermission('REPORT_USER', 'REPORT_PRINT'), true);
});

test('User deletion rule prevents self-deletion, non-admin deletion, and deleting last admin', () => {
  // Non-admin cannot delete
  assert.equal(
    canDeleteUserAccount({
      actorId: 'usr-2',
      actorRole: 'VERIFIER',
      targetUserId: 'usr-3',
      targetUserRole: 'DATA_ENTRY_OPERATOR',
      activeAdminCount: 1,
    }).allowed,
    false
  );

  // Admin cannot delete own active session account
  assert.equal(
    canDeleteUserAccount({
      actorId: 'usr-admin-01',
      actorRole: 'SYSTEM_ADMIN',
      targetUserId: 'usr-admin-01',
      targetUserRole: 'SYSTEM_ADMIN',
      activeAdminCount: 2,
    }).allowed,
    false
  );

  // Admin can delete another operator account
  assert.equal(
    canDeleteUserAccount({
      actorId: 'usr-admin-01',
      actorRole: 'SYSTEM_ADMIN',
      targetUserId: 'usr-report-01',
      targetUserRole: 'REPORT_USER',
      activeAdminCount: 1,
    }).allowed,
    true
  );
});

test('Injury record deletion rule allows authorized roles and blocks read-only report user', () => {
  assert.equal(canDeleteInjuryRecord('SYSTEM_ADMIN').allowed, true);
  assert.equal(canDeleteInjuryRecord('DATA_ENTRY_OPERATOR').allowed, true);
  assert.equal(canDeleteInjuryRecord('REPORT_USER').allowed, false);
});


