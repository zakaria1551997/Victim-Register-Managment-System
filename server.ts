import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  getDb,
  hashPassword,
  verifyPassword,
  STORAGE_DIR,
  BACKUP_DIR,
  createDatabaseBackupSnapshot,
} from './src/db/postgres.ts';
import {
  UserRoleCode,
  PermissionCode,
  WorkflowStatus,
  ROLE_LABELS_BN,
  WORKFLOW_STATUS_LABELS_BN,
  normalizeRegNo,
  validateInjuryRecordInput,
  canTransitionWorkflowStatus,
  validateAttachmentMeta,
  canDeleteUserAccount,
} from './src/utils/registerRules.ts';

dotenv.config();

const PORT = 3000;
const SESSION_SECRET =
  process.env.SESSION_SECRET || 'hospital-injury-register-hmac-secret-2026-kishoreganj';

export interface AuthUser {
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

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

function signAuthToken(userId: string, roleCode: string): string {
  const payload = JSON.stringify({
    sub: userId,
    role: roleCode,
    iat: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 24, // 24h
  });
  const base64Payload = Buffer.from(payload, 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(base64Payload)
    .digest('base64url');
  return `${base64Payload}.${sig}`;
}

function verifyAuthToken(token: string): { sub: string; role: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [base64Payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(base64Payload)
    .digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const decoded = JSON.parse(Buffer.from(base64Payload, 'base64url').toString('utf-8'));
    if (decoded.exp && Date.now() > decoded.exp) return null;
    return decoded;
  } catch {
    return null;
  }
}

async function resolveUserById(userId: string): Promise<AuthUser | null> {
  const db = await getDb();
  const userRes = await db.query(
    `SELECT id, username, full_name_bn, designation_bn, department_bn, phone, role_code, is_active
     FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const u = userRes.rows[0];
  if (!u || !u.is_active) return null;

  const permRes = await db.query<{ permission_code: PermissionCode }>(
    `SELECT permission_code FROM role_permissions WHERE role_code = $1`,
    [u.role_code]
  );
  const permissions = permRes.rows.map((r) => r.permission_code);
  const roleCode = u.role_code as UserRoleCode;

  return {
    id: u.id,
    username: u.username,
    fullNameBn: u.full_name_bn,
    designationBn: u.designation_bn,
    departmentBn: u.department_bn,
    phone: u.phone || '',
    roleCode,
    roleNameBn: ROLE_LABELS_BN[roleCode] || roleCode,
    permissions,
  };
}

async function logAudit(
  actor: AuthUser,
  actionCode: string,
  descriptionBn: string,
  targetRecordId?: string,
  targetRegistrationNo?: string,
  ipAddress = '127.0.0.1'
) {
  const db = await getDb();
  await db.query(
    `INSERT INTO audit_logs (
      actor_id, actor_name_bn, actor_role_code, action_code,
      target_record_id, target_registration_no, description_bn, ip_address
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      actor.id,
      actor.fullNameBn,
      actor.roleCode,
      actionCode,
      targetRecordId || null,
      targetRegistrationNo || null,
      descriptionBn,
      ipAddress,
    ]
  );
}

const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (typeof req.query.token === 'string') {
      token = req.query.token;
    }

    let user: AuthUser | null = null;
    if (token) {
      const verified = verifyAuthToken(token);
      if (verified) {
        user = await resolveUserById(verified.sub);
      }
    }

    // Default to System Admin (মোঃ জাকারিয়া আহমেদ) on first load if no token is provided yet,
    // so the preview opens directly into the live hospital register while still enforcing RBAC per active user.
    if (!user) {
      user = await resolveUserById('usr-admin-01');
    }

    if (!user) {
      return res.status(401).json({ error: 'অনুমোদিত ব্যবহারকারী পাওয়া যায়নি। অনুগ্রহ করে লগইন করুন।' });
    }

    req.authUser = user;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: 'প্রমাণীকরণ যাচাইয়ে ত্রুটি ঘটেছে।' });
  }
};

const requirePermission = (permission: PermissionCode) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.authUser;
    if (!user) {
      return res.status(401).json({ error: 'অনুমোদিত সেশন নেই।' });
    }
    if (!user.permissions.includes(permission)) {
      return res.status(403).json({
        error: `নিরাপত্তা বাধা: আপনার ভূমিকা (${user.roleNameBn})-এর জন্য "${permission}" অনুমতি নেই।`,
      });
    }
    next();
  };
};

async function fetchFullRecordById(id: string) {
  const db = await getDb();
  const recRes = await db.query(
    `SELECT r.*,
            l.additional_reg_no, l.additional_reg_date,
            l.signature_no, l.signature_date,
            l.police_station_name, l.police_case_no, l.police_case_date,
            l.court_case_no, l.court_case_date,
            l.mc_dispatch_date, l.required_test_reports, l.recommender_info,
            l.application_attachment_note, l.other_attachment_note, l.entry_book_attachment_note,
            l.confidentiality_level
     FROM injury_registers r
     LEFT JOIN legal_details l ON l.record_id = r.id
     WHERE r.id = $1 LIMIT 1`,
    [id]
  );

  if (!recRes.rows[0]) return null;
  const row = recRes.rows[0];

  const attRes = await db.query(
    `SELECT id, record_id, category, original_name, mime_type, file_size_bytes,
            checksum_sha256, uploaded_by, uploaded_by_name_bn, is_deleted,
            deleted_at, delete_reason, created_at
     FROM attachments
     WHERE record_id = $1
     ORDER BY created_at ASC`,
    [id]
  );

  const reviewRes = await db.query(
    `SELECT * FROM review_history WHERE record_id = $1 ORDER BY created_at DESC, id DESC`,
    [id]
  );

  const revRes = await db.query(
    `SELECT * FROM record_revisions WHERE record_id = $1 ORDER BY revision_no DESC, id DESC`,
    [id]
  );

  return {
    ...mapRecordRow(row, attRes.rows.filter((a: any) => !a.is_deleted)),
    allAttachmentsWithHistory: attRes.rows,
    reviewHistory: reviewRes.rows,
    revisions: revRes.rows,
  };
}

function mapRecordRow(row: any, activeAttachments: any[] = []) {
  return {
    id: row.id,
    registrationNo: row.registration_no,
    registrationDate: row.registration_date,
    injuredName: row.injured_name,
    injuredAge: row.injured_age,
    fatherOrGuardianName: row.father_or_guardian_name,
    injuredAddress: row.injured_address,
    doctorName: row.doctor_name,
    doctorDesignation: row.doctor_designation,
    doctorEntryNotFound: Boolean(row.doctor_entry_not_found),
    additionalRegNo: row.additional_reg_no || '',
    additionalRegDate: row.additional_reg_date || '',
    signatureNo: row.signature_no || '',
    signatureDate: row.signature_date || '',
    policeStationName: row.police_station_name || '',
    policeCaseNo: row.police_case_no || '',
    policeCaseDate: row.police_case_date || '',
    courtCaseNo: row.court_case_no || '',
    courtCaseDate: row.court_case_date || '',
    mcDispatchDate: row.mc_dispatch_date || '',
    requiredTestReports: row.required_test_reports || '',
    recommenderInfo: row.recommender_info || '',
    applicationAttachmentNote: row.application_attachment_note || '',
    otherAttachmentNote: row.other_attachment_note || '',
    entryBookAttachmentNote: row.entry_book_attachment_note || '',
    confidentialityLevel: row.confidentiality_level || 'RESTRICTED',
    remarks: row.remarks || '',
    completionStatus: row.completion_status,
    workflowStatus: row.workflow_status,
    revisionCount: Number(row.revision_count || 1),
    createdBy: row.created_by,
    createdByNameBn: row.created_by_name_bn,
    verifiedBy: row.verified_by,
    verifiedByNameBn: row.verified_by_name_bn,
    verifiedAt: row.verified_at,
    approvedBy: row.approved_by,
    approvedByNameBn: row.approved_by_name_bn,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: activeAttachments.map((a) => ({
      id: a.id,
      recordId: a.record_id,
      category: a.category,
      originalName: a.original_name,
      mimeType: a.mime_type,
      fileSizeBytes: Number(a.file_size_bytes),
      checksumSha256: a.checksum_sha256,
      uploadedByNameBn: a.uploaded_by_name_bn,
      createdAt: a.created_at,
    })),
  };
}

async function startServer() {
  // Ensure database & seed data are initialized before accepting requests
  await getDb();

  const app = express();
  app.use(express.json({ limit: '12mb' }));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // -------------------------------------------------------------------------
  // AUTH & SESSION ENDPOINTS
  // -------------------------------------------------------------------------
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ error: 'ব্যবহারকারীর নাম ও পাসওয়ার্ড প্রদান করুন।' });
      }
      const db = await getDb();
      const userRes = await db.query(
        `SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
        [String(username).trim()]
      );
      const userRow = userRes.rows[0];
      if (!userRow || !verifyPassword(String(password), userRow.password_hash)) {
        return res.status(401).json({ error: 'ব্যবহারকারীর নাম অথবা পাসওয়ার্ড সঠিক নয়।' });
      }
      if (!userRow.is_active) {
        return res.status(403).json({ error: 'এই ব্যবহারকারীর অ্যাকাউন্ট বর্তমানে নিষ্ক্রিয় করা আছে।' });
      }

      await db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userRow.id]);
      const authUser = await resolveUserById(userRow.id);
      if (!authUser) {
        return res.status(403).json({ error: 'ব্যবহারকারী লোড করা সম্ভব হয়নি।' });
      }

      const token = signAuthToken(authUser.id, authUser.roleCode);
      await logAudit(
        authUser,
        'LOGIN',
        `${authUser.fullNameBn} (${authUser.roleNameBn}) সিস্টেমে লগইন করেছেন।`
      );

      return res.json({ token, user: authUser });
    } catch (error) {
      console.error('Login failed:', error);
      return res.status(500).json({ error: 'লগইন প্রক্রিয়ায় ত্রুটি ঘটেছে।' });
    }
  });

  app.post('/api/auth/switch-user', async (req: Request, res: Response) => {
    try {
      const { userId } = req.body || {};
      if (!userId) {
        return res.status(400).json({ error: 'ব্যবহারকারী আইডি প্রয়োজন।' });
      }
      const authUser = await resolveUserById(String(userId));
      if (!authUser) {
        return res.status(404).json({ error: 'সক্রিয় ব্যবহারকারী পাওয়া যায়নি।' });
      }
      const token = signAuthToken(authUser.id, authUser.roleCode);
      await logAudit(
        authUser,
        'LOGIN',
        `ভূমিকা/ব্যবহারকারী পরিবর্তন: ${authUser.fullNameBn} (${authUser.roleNameBn}) সেশনে প্রবেশ করেছেন।`
      );
      return res.json({ token, user: authUser });
    } catch (error) {
      console.error('Switch user error:', error);
      return res.status(500).json({ error: 'ব্যবহারকারী পরিবর্তনে ত্রুটি ঘটেছে।' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const allUsersRes = await db.query(
      `SELECT id, username, full_name_bn, designation_bn, department_bn, role_code, is_active
       FROM users WHERE is_active = TRUE ORDER BY id ASC`
    );
    const token = signAuthToken(req.authUser!.id, req.authUser!.roleCode);
    return res.json({
      user: req.authUser,
      token,
      availableAccounts: allUsersRes.rows.map((u: any) => ({
        id: u.id,
        username: u.username,
        fullNameBn: u.full_name_bn,
        designationBn: u.designation_bn,
        departmentBn: u.department_bn,
        roleCode: u.role_code,
        roleNameBn: ROLE_LABELS_BN[u.role_code as UserRoleCode] || u.role_code,
      })),
    });
  });

  // -------------------------------------------------------------------------
  // DASHBOARD SUMMARY ENDPOINT (Module A)
  // -------------------------------------------------------------------------
  app.get(
    '/api/dashboard/summary',
    requireAuth,
    requirePermission('RECORD_VIEW'),
    async (_req: AuthenticatedRequest, res: Response) => {
      try {
        const db = await getDb();
        const todayIso = new Date().toISOString().slice(0, 10);

        const statsRes = await db.query<{
          total_records: string;
          today_records: string;
          pending_verification: string;
          pending_approval: string;
          approved_records: string;
          incomplete_records: string;
          complete_records: string;
          returned_records: string;
          draft_records: string;
        }>(
          `SELECT
            COUNT(*) AS total_records,
            COUNT(*) FILTER (WHERE registration_date = $1) AS today_records,
            COUNT(*) FILTER (WHERE workflow_status = 'PENDING_VERIFICATION') AS pending_verification,
            COUNT(*) FILTER (WHERE workflow_status = 'PENDING_APPROVAL') AS pending_approval,
            COUNT(*) FILTER (WHERE workflow_status = 'APPROVED') AS approved_records,
            COUNT(*) FILTER (WHERE completion_status = 'INCOMPLETE') AS incomplete_records,
            COUNT(*) FILTER (WHERE completion_status = 'COMPLETE') AS complete_records,
            COUNT(*) FILTER (WHERE workflow_status = 'RETURNED_FOR_CORRECTION') AS returned_records,
            COUNT(*) FILTER (WHERE workflow_status = 'DRAFT') AS draft_records
           FROM injury_registers`,
          [todayIso]
        );

        const s = statsRes.rows[0] || ({} as any);
        const recentAuditRes = await db.query(
          `SELECT id, actor_name_bn, actor_role_code, action_code, target_record_id,
                  target_registration_no, description_bn, created_at
           FROM audit_logs
           ORDER BY created_at DESC, id DESC
           LIMIT 10`
        );

        return res.json({
          totalRecords: Number(s.total_records || 0),
          todayNewRecords: Number(s.today_records || 0),
          pendingVerification: Number(s.pending_verification || 0),
          pendingApproval: Number(s.pending_approval || 0),
          approvedRecords: Number(s.approved_records || 0),
          incompleteRecords: Number(s.incomplete_records || 0),
          completeRecords: Number(s.complete_records || 0),
          returnedRecords: Number(s.returned_records || 0),
          draftRecords: Number(s.draft_records || 0),
          recentActivities: recentAuditRes.rows.map((a: any) => ({
            id: a.id,
            actorNameBn: a.actor_name_bn,
            actorRoleBn: ROLE_LABELS_BN[a.actor_role_code as UserRoleCode] || a.actor_role_code,
            actionCode: a.action_code,
            targetRecordId: a.target_record_id,
            targetRegistrationNo: a.target_registration_no,
            descriptionBn: a.description_bn,
            createdAt: a.created_at,
          })),
        });
      } catch (error) {
        console.error('Dashboard summary error:', error);
        return res.status(500).json({ error: 'ড্যাশবোর্ডের তথ্য লোড করতে সমস্যা হয়েছে।' });
      }
    }
  );

  // -------------------------------------------------------------------------
  // DUPLICATE REGISTRATION NUMBER CHECK (Module B & C)
  // -------------------------------------------------------------------------
  app.get(
    '/api/records/check-duplicate',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const regNo = String(req.query.regNo || '');
        const excludeId = req.query.excludeId ? String(req.query.excludeId) : undefined;
        const normalized = normalizeRegNo(regNo);
        if (!normalized) {
          return res.json({ isDuplicate: false });
        }
        const db = await getDb();
        const existingRes = await db.query(
          `SELECT id, registration_no, injured_name, registration_date
           FROM injury_registers
           WHERE normalized_reg_no = $1`,
          [normalized]
        );
        const match = existingRes.rows.find((r: any) => r.id !== excludeId);
        if (match) {
          return res.json({
            isDuplicate: true,
            matchedRecordId: match.id,
            matchedRegNo: match.registration_no,
            matchedInjuredName: match.injured_name,
            matchedDate: match.registration_date,
          });
        }
        return res.json({ isDuplicate: false });
      } catch (error) {
        console.error('Duplicate check failed:', error);
        return res.status(500).json({ error: 'ডুপ্লিকেট নম্বর যাচাই করা যায়নি।' });
      }
    }
  );

  // -------------------------------------------------------------------------
  // LIST & FILTER 13-COLUMN INJURY REGISTER RECORDS (Module C & G)
  // -------------------------------------------------------------------------
  app.get(
    '/api/records',
    requireAuth,
    requirePermission('RECORD_VIEW'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const db = await getDb();
        const search = String(req.query.search || '').trim().toLowerCase();
        const fromDate = String(req.query.fromDate || '').trim();
        const toDate = String(req.query.toDate || '').trim();
        const completionStatus = String(req.query.completionStatus || '').trim();
        const workflowStatus = String(req.query.workflowStatus || '').trim();

        const rowsRes = await db.query(
          `SELECT r.*,
                  l.additional_reg_no, l.additional_reg_date,
                  l.signature_no, l.signature_date,
                  l.police_station_name, l.police_case_no, l.police_case_date,
                  l.court_case_no, l.court_case_date,
                  l.mc_dispatch_date, l.required_test_reports, l.recommender_info,
                  l.application_attachment_note, l.other_attachment_note, l.entry_book_attachment_note,
                  l.confidentiality_level
           FROM injury_registers r
           LEFT JOIN legal_details l ON l.record_id = r.id
           ORDER BY r.registration_date ASC, r.id ASC`
        );

        const attRes = await db.query(
          `SELECT * FROM attachments WHERE is_deleted = FALSE ORDER BY created_at ASC`
        );

        const attByRecord = new Map<string, any[]>();
        for (const a of attRes.rows) {
          const list = attByRecord.get(a.record_id) || [];
          list.push(a);
          attByRecord.set(a.record_id, list);
        }

        let mapped = rowsRes.rows.map((r: any) =>
          mapRecordRow(r, attByRecord.get(r.id) || [])
        );

        if (search) {
          const normSearch = normalizeRegNo(search).toLowerCase();
          mapped = mapped.filter((item) => {
            const hay = [
              item.id,
              item.registrationNo,
              normalizeRegNo(item.registrationNo),
              item.injuredName,
              item.fatherOrGuardianName,
              item.injuredAddress,
              item.doctorName,
              item.additionalRegNo,
              item.signatureNo,
              item.policeStationName,
              item.policeCaseNo,
              item.courtCaseNo,
              item.recommenderInfo,
              item.remarks,
            ]
              .join(' ')
              .toLowerCase();
            return hay.includes(search) || (normSearch && hay.includes(normSearch));
          });
        }

        if (fromDate) {
          mapped = mapped.filter((item) => item.registrationDate >= fromDate);
        }
        if (toDate) {
          mapped = mapped.filter((item) => item.registrationDate <= toDate);
        }
        if (completionStatus && completionStatus !== 'ALL') {
          mapped = mapped.filter((item) => item.completionStatus === completionStatus);
        }
        if (workflowStatus && workflowStatus !== 'ALL') {
          mapped = mapped.filter((item) => item.workflowStatus === workflowStatus);
        }

        return res.json({ records: mapped, total: mapped.length });
      } catch (error) {
        console.error('List records error:', error);
        return res.status(500).json({ error: 'জখমী রেজিস্টার তালিকা লোড করা যায়নি।' });
      }
    }
  );

  // -------------------------------------------------------------------------
  // SINGLE RECORD DETAIL VIEW (Module C, D, E, I)
  // -------------------------------------------------------------------------
  app.get(
    '/api/records/:id',
    requireAuth,
    requirePermission('RECORD_VIEW'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const recordId = String(req.params.id);
        const fullRecord = await fetchFullRecordById(recordId);
        if (!fullRecord) {
          return res.status(404).json({ error: 'জখমী রেকর্ডটি খুঁজে পাওয়া যায়নি।' });
        }

        await logAudit(
          req.authUser!,
          'RECORD_VIEW',
          `জখমী রেকর্ড (${fullRecord.registrationNo} - ${fullRecord.injuredName}) বিস্তারিত দেখা হয়েছে।`,
          fullRecord.id,
          fullRecord.registrationNo
        );

        return res.json({ record: fullRecord });
      } catch (error) {
        console.error('Get record detail error:', error);
        return res.status(500).json({ error: 'রেকর্ডের বিস্তারিত তথ্য লোড করতে ত্রুটি ঘটেছে।' });
      }
    }
  );

  // -------------------------------------------------------------------------
  // CREATE NEW 13-COLUMN RECORD (Module B)
  // -------------------------------------------------------------------------
  app.post(
    '/api/records',
    requireAuth,
    requirePermission('RECORD_CREATE'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const body = req.body || {};
        const saveAsDraft = Boolean(body.saveAsDraft);

        const validation = validateInjuryRecordInput(body, saveAsDraft);
        if (!validation.valid) {
          return res.status(400).json({
            error: 'ফর্মে প্রদত্ত তথ্যে অসম্পূর্ণতা রয়েছে। অনুগ্রহ করে চিহ্নিত ঘরগুলো পূরণ করুন।',
            fieldErrors: validation.errors,
          });
        }

        const normalizedReg = normalizeRegNo(body.registrationNo);
        const db = await getDb();

        const dupRes = await db.query(
          `SELECT id, registration_no, injured_name FROM injury_registers WHERE normalized_reg_no = $1 LIMIT 1`,
          [normalizedReg]
        );
        if (dupRes.rows[0]) {
          return res.status(409).json({
            error: `ডুপ্লিকেট রেজিস্ট্রেশন নম্বর! "${body.registrationNo}" নম্বরটি ইতিমধ্যে (${dupRes.rows[0].injured_name})-এর নামে নিবন্ধিত আছে।`,
            duplicateRecord: dupRes.rows[0],
          });
        }

        const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM injury_registers');
        const nextNum = Number(countRes.rows[0]?.count || 0) + 1;
        const internalId = `INJ-2026-${String(nextNum).padStart(4, '0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

        const initialWorkflowStatus: WorkflowStatus = 'APPROVED';

        const user = req.authUser!;

        await db.query(
          `INSERT INTO injury_registers (
            id, registration_no, normalized_reg_no, registration_date,
            injured_name, injured_age, father_or_guardian_name, injured_address,
            doctor_name, doctor_designation, doctor_entry_not_found,
            remarks, completion_status, workflow_status, revision_count,
            created_by, created_by_name_bn
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,1,$15,$16)`,
          [
            internalId,
            String(body.registrationNo).trim(),
            normalizedReg,
            String(body.registrationDate).trim(),
            String(body.injuredName).trim(),
            String(body.injuredAge || '').trim(),
            String(body.fatherOrGuardianName || '').trim(),
            String(body.injuredAddress || '').trim(),
            body.doctorEntryNotFound ? '' : String(body.doctorName || '').trim(),
            String(body.doctorDesignation || '').trim(),
            Boolean(body.doctorEntryNotFound),
            String(body.remarks || '').trim(),
            body.completionStatus === 'COMPLETE' ? 'COMPLETE' : 'INCOMPLETE',
            initialWorkflowStatus,
            user.id,
            user.fullNameBn,
          ]
        );

        await db.query(
          `INSERT INTO legal_details (
            record_id, additional_reg_no, additional_reg_date,
            signature_no, signature_date,
            police_station_name, police_case_no, police_case_date,
            court_case_no, court_case_date,
            mc_dispatch_date, required_test_reports, recommender_info,
            application_attachment_note, other_attachment_note, entry_book_attachment_note
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            internalId,
            String(body.additionalRegNo || '').trim(),
            String(body.additionalRegDate || '').trim(),
            String(body.signatureNo || '').trim(),
            String(body.signatureDate || '').trim(),
            String(body.policeStationName || '').trim(),
            String(body.policeCaseNo || '').trim(),
            String(body.policeCaseDate || '').trim(),
            String(body.courtCaseNo || '').trim(),
            String(body.courtCaseDate || '').trim(),
            String(body.mcDispatchDate || '').trim(),
            String(body.requiredTestReports || '').trim(),
            String(body.recommenderInfo || '').trim(),
            String(body.applicationAttachmentNote || '').trim(),
            String(body.otherAttachmentNote || '').trim(),
            String(body.entryBookAttachmentNote || '').trim(),
          ]
        );

        await logAudit(
          user,
          'RECORD_CREATE',
          `নতুন জখমী রেকর্ড (${body.registrationNo} - ${body.injuredName}) রেজিস্টারে সংরক্ষণ করা হয়েছে।`,
          internalId,
          String(body.registrationNo).trim()
        );

        const created = await fetchFullRecordById(internalId);
        return res.status(201).json({ record: created });
      } catch (error) {
        console.error('Create record error:', error);
        return res.status(500).json({ error: 'নতুন রেকর্ড সংরক্ষণে সার্ভার ত্রুটি ঘটেছে।' });
      }
    }
  );

  // -------------------------------------------------------------------------
  // UPDATE RECORD WITH IMMUTABLE REVISION TRACKING (Module C)
  // -------------------------------------------------------------------------
  app.put(
    '/api/records/:id',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const recordId = String(req.params.id);
        const body = req.body || {};
        const user = req.authUser!;

        const existing = await fetchFullRecordById(recordId);
        if (!existing) {
          return res.status(404).json({ error: 'রেকর্ডটি পাওয়া যায়নি।' });
        }

        const canEdit =
          user.permissions.includes('RECORD_EDIT_ANY') ||
          user.permissions.includes('RECORD_EDIT_OWN_DRAFT') ||
          user.permissions.includes('RECORD_EDIT_APPROVED') ||
          user.permissions.includes('RECORD_CREATE');

        if (!canEdit) {
          return res.status(403).json({
            error: 'এই রেকর্ড সম্পাদনা করার অনুমতি আপনার নেই।',
          });
        }

        const validation = validateInjuryRecordInput(body, false);
        if (!validation.valid) {
          return res.status(400).json({
            error: 'ফর্মে প্রদত্ত তথ্যে অসম্পূর্ণতা রয়েছে।',
            fieldErrors: validation.errors,
          });
        }

        const db = await getDb();
        const normalizedReg = normalizeRegNo(body.registrationNo);
        const dupRes = await db.query(
          `SELECT id, registration_no, injured_name FROM injury_registers
           WHERE normalized_reg_no = $1 AND id != $2 LIMIT 1`,
          [normalizedReg, recordId]
        );
        if (dupRes.rows[0]) {
          return res.status(409).json({
            error: `ডুপ্লিকেট রেজিস্ট্রেশন নম্বর! "${body.registrationNo}" নম্বরটি ইতিমধ্যে অন্য রেকর্ডে ব্যবহৃত হয়েছে।`,
          });
        }

        // Compute changed fields for immutable revision log
        const trackedKeys = [
          'registrationNo',
          'registrationDate',
          'injuredName',
          'injuredAge',
          'fatherOrGuardianName',
          'injuredAddress',
          'doctorName',
          'doctorEntryNotFound',
          'additionalRegNo',
          'additionalRegDate',
          'signatureNo',
          'signatureDate',
          'policeStationName',
          'policeCaseNo',
          'policeCaseDate',
          'courtCaseNo',
          'courtCaseDate',
          'mcDispatchDate',
          'requiredTestReports',
          'recommenderInfo',
          'remarks',
          'completionStatus',
        ] as const;

        const changedFields: Array<{ field: string; before: any; after: any }> = [];
        for (const k of trackedKeys) {
          const beforeVal = (existing as any)[k] ?? '';
          const afterVal = body[k] ?? '';
          if (String(beforeVal) !== String(afterVal)) {
            changedFields.push({ field: k, before: beforeVal, after: afterVal });
          }
        }

        const nextRevisionNo = Number(existing.revisionCount || 1) + 1;

        await db.query(
          `UPDATE injury_registers SET
            registration_no = $1,
            normalized_reg_no = $2,
            registration_date = $3,
            injured_name = $4,
            injured_age = $5,
            father_or_guardian_name = $6,
            injured_address = $7,
            doctor_name = $8,
            doctor_designation = $9,
            doctor_entry_not_found = $10,
            remarks = $11,
            completion_status = $12,
            revision_count = $13,
            updated_at = NOW()
           WHERE id = $14`,
          [
            String(body.registrationNo).trim(),
            normalizedReg,
            String(body.registrationDate).trim(),
            String(body.injuredName).trim(),
            String(body.injuredAge || '').trim(),
            String(body.fatherOrGuardianName || '').trim(),
            String(body.injuredAddress || '').trim(),
            body.doctorEntryNotFound ? '' : String(body.doctorName || '').trim(),
            String(body.doctorDesignation || '').trim(),
            Boolean(body.doctorEntryNotFound),
            String(body.remarks || '').trim(),
            body.completionStatus === 'COMPLETE' ? 'COMPLETE' : 'INCOMPLETE',
            nextRevisionNo,
            recordId,
          ]
        );

        await db.query(
          `UPDATE legal_details SET
            additional_reg_no = $1,
            additional_reg_date = $2,
            signature_no = $3,
            signature_date = $4,
            police_station_name = $5,
            police_case_no = $6,
            police_case_date = $7,
            court_case_no = $8,
            court_case_date = $9,
            mc_dispatch_date = $10,
            required_test_reports = $11,
            recommender_info = $12,
            application_attachment_note = $13,
            other_attachment_note = $14,
            entry_book_attachment_note = $15,
            updated_at = NOW()
           WHERE record_id = $16`,
          [
            String(body.additionalRegNo || '').trim(),
            String(body.additionalRegDate || '').trim(),
            String(body.signatureNo || '').trim(),
            String(body.signatureDate || '').trim(),
            String(body.policeStationName || '').trim(),
            String(body.policeCaseNo || '').trim(),
            String(body.policeCaseDate || '').trim(),
            String(body.courtCaseNo || '').trim(),
            String(body.courtCaseDate || '').trim(),
            String(body.mcDispatchDate || '').trim(),
            String(body.requiredTestReports || '').trim(),
            String(body.recommenderInfo || '').trim(),
            String(body.applicationAttachmentNote || '').trim(),
            String(body.otherAttachmentNote || '').trim(),
            String(body.entryBookAttachmentNote || '').trim(),
            recordId,
          ]
        );

        const updatedSnapshot = await fetchFullRecordById(recordId);

        await db.query(
          `INSERT INTO record_revisions (
            record_id, revision_no, changed_by, changed_by_name_bn,
            change_reason_bn, previous_snapshot_json, new_snapshot_json,
            changed_fields_json, was_approved_before_edit
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE)`,
          [
            recordId,
            nextRevisionNo,
            user.id,
            user.fullNameBn,
            String(body.changeReasonBn || 'তথ্য হালনাগাদ ও সংশোধন').trim(),
            JSON.stringify(existing),
            JSON.stringify(updatedSnapshot),
            JSON.stringify(changedFields),
          ]
        );

        await logAudit(
          user,
          'RECORD_EDIT',
          `জখমী রেকর্ড (${body.registrationNo}) সংস্করণ #${nextRevisionNo}-এ সম্পাদনা করা হয়েছে (${changedFields.length}টি ফিল্ড পরিবর্তিত)।`,
          recordId,
          String(body.registrationNo)
        );

        const fresh = await fetchFullRecordById(recordId);
        return res.json({ record: fresh });
      } catch (error) {
        console.error('Update record error:', error);
        return res.status(500).json({ error: 'রেকর্ড হালনাগাদ করতে ত্রুটি ঘটেছে।' });
      }
    }
  );

  // -------------------------------------------------------------------------
  // DELETE INJURY RECORD (Module C)
  // -------------------------------------------------------------------------
  app.delete(
    '/api/records/:id',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const recordId = String(req.params.id);
        const { reasonBn } = req.body || {};
        const user = req.authUser!;

        const canDelete =
          user.roleCode === 'SYSTEM_ADMIN' ||
          user.permissions.includes('RECORD_DELETE') ||
          user.permissions.includes('RECORD_EDIT_ANY') ||
          user.permissions.includes('RECORD_CREATE');

        if (!canDelete) {
          return res.status(403).json({
            error: 'জখমী রেকর্ড ডিলিট করার অনুমতি আপনার নেই।',
          });
        }

        const existing = await fetchFullRecordById(recordId);
        if (!existing) {
          return res.status(404).json({ error: 'জখমী রেকর্ডটি খুঁজে পাওয়া যায়নি।' });
        }

        const db = await getDb();
        await db.query(`DELETE FROM attachments WHERE record_id = $1`, [recordId]);
        await db.query(`DELETE FROM legal_details WHERE record_id = $1`, [recordId]);
        await db.query(`DELETE FROM record_revisions WHERE record_id = $1`, [recordId]);
        await db.query(`DELETE FROM review_history WHERE record_id = $1`, [recordId]);
        await db.query(`DELETE FROM injury_registers WHERE id = $1`, [recordId]);

        const noteText =
          reasonBn && String(reasonBn).trim()
            ? ` কারণ: ${String(reasonBn).trim()}`
            : '';

        await logAudit(
          user,
          'RECORD_DELETE',
          `জখমী রেকর্ড (রেজি: নং ${existing.registrationNo} - ${existing.injuredName}) রেজিস্টার থেকে ডিলিট করা হয়েছে।${noteText}`,
          recordId,
          existing.registrationNo
        );

        return res.json({
          success: true,
          deletedId: recordId,
          messageBn: `জখমী রেকর্ড (${existing.registrationNo} - ${existing.injuredName}) সফলভাবে ডিলিট করা হয়েছে।`,
        });
      } catch (error) {
        console.error('Delete record error:', error);
        return res.status(500).json({ error: 'জখমী রেকর্ড ডিলিট করতে সার্ভার ত্রুটি ঘটেছে।' });
      }
    }
  );

  // -------------------------------------------------------------------------
  // WORKFLOW VERIFICATION & APPROVAL TRANSITION (Module E)
  // -------------------------------------------------------------------------
  app.post(
    '/api/records/:id/workflow',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const recordId = String(req.params.id);
        const { targetStatus, commentBn } = req.body || {};
        const user = req.authUser!;

        const existing = await fetchFullRecordById(recordId);
        if (!existing) {
          return res.status(404).json({ error: 'রেকর্ডটি পাওয়া যায়নি।' });
        }

        const currentStatus = existing.workflowStatus as WorkflowStatus;
        const nextStatus = targetStatus as WorkflowStatus;

        const check = canTransitionWorkflowStatus(currentStatus, nextStatus, user.roleCode);
        if (!check.allowed) {
          return res.status(403).json({ error: check.reasonBn });
        }

        if (
          (nextStatus === 'RETURNED_FOR_CORRECTION' || nextStatus === 'REJECTED') &&
          (!commentBn || !String(commentBn).trim())
        ) {
          return res.status(400).json({
            error: 'সংশোধনের জন্য ফেরত বা প্রত্যাখ্যান করার ক্ষেত্রে সুনির্দিষ্ট মন্তব্য/কারণ লেখা আবশ্যক।',
          });
        }

        const db = await getDb();
        if (nextStatus === 'PENDING_APPROVAL') {
          await db.query(
            `UPDATE injury_registers
             SET workflow_status = $1, verified_by = $2, verified_by_name_bn = $3, verified_at = NOW(), updated_at = NOW()
             WHERE id = $4`,
            [nextStatus, user.id, user.fullNameBn, recordId]
          );
        } else if (nextStatus === 'APPROVED') {
          await db.query(
            `UPDATE injury_registers
             SET workflow_status = $1, approved_by = $2, approved_by_name_bn = $3, approved_at = NOW(), updated_at = NOW()
             WHERE id = $4`,
            [nextStatus, user.id, user.fullNameBn, recordId]
          );
        } else {
          await db.query(
            `UPDATE injury_registers SET workflow_status = $1, updated_at = NOW() WHERE id = $2`,
            [nextStatus, recordId]
          );
        }

        const actionMap: Record<WorkflowStatus, string> = {
          DRAFT: 'SAVED_DRAFT',
          PENDING_VERIFICATION: 'SUBMITTED',
          RETURNED_FOR_CORRECTION: 'RETURNED',
          PENDING_APPROVAL: 'VERIFIED',
          APPROVED: 'APPROVED',
          REJECTED: 'REJECTED',
        };

        await db.query(
          `INSERT INTO review_history (
            record_id, action_type, from_status, to_status,
            actor_id, actor_name_bn, actor_role_bn, comment_bn
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            recordId,
            actionMap[nextStatus] || 'UPDATED',
            currentStatus,
            nextStatus,
            user.id,
            user.fullNameBn,
            user.roleNameBn,
            String(commentBn || `${WORKFLOW_STATUS_LABELS_BN[nextStatus]} হিসেবে সিদ্ধান্ত গৃহীত।`).trim(),
          ]
        );

        await logAudit(
          user,
          `WORKFLOW_${nextStatus}`,
          `রেকর্ড (${existing.registrationNo})-এর স্ট্যাটাস "${WORKFLOW_STATUS_LABELS_BN[currentStatus]}" থেকে "${WORKFLOW_STATUS_LABELS_BN[nextStatus]}"-এ পরিবর্তন করা হয়েছে। মন্তব্য: ${commentBn || 'নেই'}`,
          recordId,
          existing.registrationNo
        );

        const updated = await fetchFullRecordById(recordId);
        return res.json({ record: updated });
      } catch (error) {
        console.error('Workflow transition error:', error);
        return res.status(500).json({ error: 'যাচাই/অনুমোদন প্রক্রিয়ায় সার্ভার ত্রুটি ঘটেছে।' });
      }
    }
  );

  // -------------------------------------------------------------------------
  // PROTECTED ATTACHMENTS UPLOAD, STREAM & SOFT-DELETE (Module H)
  // -------------------------------------------------------------------------
  app.post(
    '/api/records/:id/attachments',
    requireAuth,
    requirePermission('ATTACHMENT_UPLOAD'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const recordId = String(req.params.id);
        const { category, fileName, mimeType, base64Data } = req.body || {};
        const user = req.authUser!;

        const existing = await fetchFullRecordById(recordId);
        if (!existing) {
          return res.status(404).json({ error: 'রেকর্ডটি পাওয়া যায়নি।' });
        }

        if (!base64Data || typeof base64Data !== 'string') {
          return res.status(400).json({ error: 'ফাইলের ডাটা পাওয়া যায়নি।' });
        }

        const cleanBase64 = base64Data.includes(',')
          ? base64Data.split(',')[1]
          : base64Data;
        const fileBuffer = Buffer.from(cleanBase64, 'base64');

        const metaCheck = validateAttachmentMeta(
          String(fileName || ''),
          String(mimeType || ''),
          fileBuffer.length
        );
        if (!metaCheck.valid) {
          return res.status(400).json({ error: metaCheck.errorBn });
        }

        const safeFileName = String(fileName)
          .replace(/[^a-zA-Z0-9._-\u0980-\u09FF]/g, '_')
          .slice(0, 80);
        const storedFileName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeFileName}`;
        const fullPath = path.join(STORAGE_DIR, storedFileName);
        fs.writeFileSync(fullPath, fileBuffer);

        const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        const attId = `ATT-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const validCategory = ['APPLICATION', 'OTHER_INFO', 'ENTRY_BOOK', 'TEST_REPORT'].includes(
          category
        )
          ? category
          : 'OTHER_INFO';

        const db = await getDb();
        await db.query(
          `INSERT INTO attachments (
            id, record_id, category, original_name, stored_file_name,
            mime_type, file_size_bytes, checksum_sha256, uploaded_by, uploaded_by_name_bn
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            attId,
            recordId,
            validCategory,
            String(fileName),
            storedFileName,
            String(mimeType),
            fileBuffer.length,
            checksum,
            user.id,
            user.fullNameBn,
          ]
        );

        await logAudit(
          user,
          'ATTACHMENT_UPLOAD',
          `রেকর্ড (${existing.registrationNo})-এ সংযুক্তি ফাইল "${fileName}" (${validCategory}) আপলোড করা হয়েছে।`,
          recordId,
          existing.registrationNo
        );

        const updated = await fetchFullRecordById(recordId);
        return res.status(201).json({ record: updated });
      } catch (error) {
        console.error('Upload attachment error:', error);
        return res.status(500).json({ error: 'সংযুক্তি আপলোড করতে সমস্যা হয়েছে।' });
      }
    }
  );

  app.get(
    '/api/attachments/:id/download',
    requireAuth,
    requirePermission('ATTACHMENT_VIEW'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const attId = String(req.params.id);
        const db = await getDb();
        const attRes = await db.query(
          `SELECT a.*, r.registration_no
           FROM attachments a
           JOIN injury_registers r ON r.id = a.record_id
           WHERE a.id = $1 LIMIT 1`,
          [attId]
        );
        const att = attRes.rows[0];
        if (!att || att.is_deleted) {
          return res.status(404).json({ error: 'সংযুক্তি ফাইলটি পাওয়া যায়নি বা মুছে ফেলা হয়েছে।' });
        }

        const filePath = path.join(STORAGE_DIR, att.stored_file_name);
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: 'সার্ভার স্টোরেজে ফাইলটি পাওয়া যায়নি।' });
        }

        await logAudit(
          req.authUser!,
          'ATTACHMENT_DOWNLOAD',
          `সংরক্ষিত সংযুক্তি ফাইল "${att.original_name}" (রেজি: ${att.registration_no}) দেখা/ডাউনলোড করা হয়েছে।`,
          att.record_id,
          att.registration_no
        );

        res.setHeader('Content-Type', att.mime_type);
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${encodeURIComponent(att.original_name)}"`
        );
        return res.sendFile(filePath);
      } catch (error) {
        console.error('Download attachment error:', error);
        return res.status(500).json({ error: 'ফাইল ডাউনলোড করতে সমস্যা হয়েছে।' });
      }
    }
  );

  app.delete(
    '/api/attachments/:id',
    requireAuth,
    requirePermission('ATTACHMENT_DELETE'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const attId = String(req.params.id);
        const reason = String(req.body?.reasonBn || 'প্রশাসনিক কারণে সংযুক্তি অপসারণ').trim();
        const db = await getDb();

        const attRes = await db.query(
          `SELECT a.*, r.registration_no
           FROM attachments a
           JOIN injury_registers r ON r.id = a.record_id
           WHERE a.id = $1 LIMIT 1`,
          [attId]
        );
        const att = attRes.rows[0];
        if (!att) {
          return res.status(404).json({ error: 'সংযুক্তি পাওয়া যায়নি।' });
        }

        await db.query(
          `UPDATE attachments
           SET is_deleted = TRUE, deleted_by = $1, deleted_at = NOW(), delete_reason = $2
           WHERE id = $3`,
          [req.authUser!.id, reason, attId]
        );

        await logAudit(
          req.authUser!,
          'ATTACHMENT_DELETE',
          `সংযুক্তি "${att.original_name}" (রেজি: ${att.registration_no}) অপসারণ করা হয়েছে। কারণ: ${reason}`,
          att.record_id,
          att.registration_no
        );

        const updated = await fetchFullRecordById(att.record_id);
        return res.json({ record: updated });
      } catch (error) {
        console.error('Delete attachment error:', error);
        return res.status(500).json({ error: 'সংযুক্তি অপসারণে ত্রুটি ঘটেছে।' });
      }
    }
  );

  // -------------------------------------------------------------------------
  // USERS, ROLES & PERMISSIONS MANAGEMENT (Module F)
  // -------------------------------------------------------------------------
  app.get(
    '/api/users',
    requireAuth,
    requirePermission('RECORD_VIEW'),
    async (_req: AuthenticatedRequest, res: Response) => {
      try {
        const db = await getDb();
        const usersRes = await db.query(
          `SELECT id, username, full_name_bn, designation_bn, department_bn, phone,
                  role_code, is_active, last_login_at, created_at
           FROM users ORDER BY created_at ASC`
        );
        const rolesRes = await db.query(`SELECT * FROM roles ORDER BY id ASC`);
        const permsRes = await db.query(`SELECT * FROM permissions ORDER BY id ASC`);
        const rolePermsRes = await db.query(`SELECT * FROM role_permissions`);

        const rolePermMap: Record<string, string[]> = {};
        for (const rp of rolePermsRes.rows) {
          if (!rolePermMap[rp.role_code]) rolePermMap[rp.role_code] = [];
          rolePermMap[rp.role_code].push(rp.permission_code);
        }

        return res.json({
          users: usersRes.rows.map((u: any) => ({
            id: u.id,
            username: u.username,
            fullNameBn: u.full_name_bn,
            designationBn: u.designation_bn,
            departmentBn: u.department_bn,
            phone: u.phone,
            roleCode: u.role_code,
            roleNameBn: ROLE_LABELS_BN[u.role_code as UserRoleCode] || u.role_code,
            isActive: Boolean(u.is_active),
            lastLoginAt: u.last_login_at,
            createdAt: u.created_at,
          })),
          roles: rolesRes.rows.map((r: any) => ({
            code: r.code,
            nameBn: r.name_bn,
            descriptionBn: r.description_bn,
            permissions: rolePermMap[r.code] || [],
          })),
          permissionsCatalog: permsRes.rows.map((p: any) => ({
            code: p.code,
            nameBn: p.name_bn,
            moduleBn: p.module_bn,
          })),
        });
      } catch (error) {
        console.error('Get users error:', error);
        return res.status(500).json({ error: 'ব্যবহারকারী ও ভূমিকার তালিকা লোড করা যায়নি।' });
      }
    }
  );

  app.post(
    '/api/users',
    requireAuth,
    requirePermission('USER_MANAGE'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { username, fullNameBn, designationBn, departmentBn, phone, password, roleCode } =
          req.body || {};

        if (!username || !fullNameBn || !designationBn || !password || !roleCode) {
          return res.status(400).json({
            error: 'ব্যবহারকারীর নাম, পূর্ণ নাম, পদবী, পাসওয়ার্ড এবং ভূমিকা প্রদান করা আবশ্যক।',
          });
        }
        if (String(password).length < 6) {
          return res.status(400).json({ error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' });
        }

        const db = await getDb();
        const existingRes = await db.query(
          `SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
          [String(username).trim()]
        );
        if (existingRes.rows[0]) {
          return res.status(409).json({ error: 'এই ইউজারনেমটি ইতিমধ্যে ব্যবহৃত হয়েছে।' });
        }

        const newId = `usr-${Date.now()}`;
        const passHash = hashPassword(String(password));

        await db.query(
          `INSERT INTO users (
            id, username, full_name_bn, designation_bn, department_bn, phone, password_hash, role_code, is_active
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
          [
            newId,
            String(username).trim(),
            String(fullNameBn).trim(),
            String(designationBn).trim(),
            String(departmentBn || 'জরুরি বিভাগ').trim(),
            String(phone || '').trim(),
            passHash,
            String(roleCode),
          ]
        );

        await logAudit(
          req.authUser!,
          'USER_CREATE',
          `নতুন ব্যবহারকারী "${fullNameBn}" (${username}) [${ROLE_LABELS_BN[roleCode as UserRoleCode] || roleCode}] তৈরি করা হয়েছে।`
        );

        return res.status(201).json({ success: true, id: newId });
      } catch (error) {
        console.error('Create user error:', error);
        return res.status(500).json({ error: 'নতুন ব্যবহারকারী তৈরি করা যায়নি।' });
      }
    }
  );

  app.patch(
    '/api/users/:id',
    requireAuth,
    requirePermission('USER_MANAGE'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const targetId = String(req.params.id);
        const { isActive, roleCode, newPassword } = req.body || {};
        const db = await getDb();

        const targetRes = await db.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [targetId]);
        const targetUser = targetRes.rows[0];
        if (!targetUser) {
          return res.status(404).json({ error: 'ব্যবহারকারী পাওয়া যায়নি।' });
        }

        if (typeof isActive === 'boolean') {
          await db.query(`UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2`, [
            isActive,
            targetId,
          ]);
        }
        if (roleCode) {
          await db.query(`UPDATE users SET role_code = $1, updated_at = NOW() WHERE id = $2`, [
            roleCode,
            targetId,
          ]);
        }
        if (newPassword && String(newPassword).trim().length >= 6) {
          const hash = hashPassword(String(newPassword).trim());
          await db.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
            hash,
            targetId,
          ]);
        }

        await logAudit(
          req.authUser!,
          'USER_UPDATE',
          `ব্যবহারকারী "${targetUser.full_name_bn}"-এর প্রোফাইল/অনুমতি হালনাগাদ করা হয়েছে।`
        );

        return res.json({ success: true });
      } catch (error) {
        console.error('Update user error:', error);
        return res.status(500).json({ error: 'ব্যবহারকারীর তথ্য হালনাগাদ করা যায়নি।' });
      }
    }
  );

  app.delete(
    '/api/users/:id',
    requireAuth,
    requirePermission('USER_MANAGE'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const targetId = String(req.params.id);
        const reasonBn = String(
          req.body?.reasonBn || 'প্রশাসনিক সিদ্ধান্তে ব্যবহারকারী বাতিল/ডিলিট'
        ).trim();
        const actor = req.authUser!;
        const db = await getDb();

        const targetRes = await db.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [targetId]);
        const targetUser = targetRes.rows[0];
        if (!targetUser) {
          return res.status(404).json({ error: 'ব্যবহারকারী খুঁজে পাওয়া যায়নি।' });
        }

        const adminCountRes = await db.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM users WHERE role_code = 'SYSTEM_ADMIN' AND is_active = TRUE`
        );
        const activeAdminCount = Number(adminCountRes.rows[0]?.count || 0);

        const check = canDeleteUserAccount({
          actorId: actor.id,
          actorRole: actor.roleCode,
          actorPermissions: actor.permissions,
          targetUserId: targetUser.id,
          targetUserRole: targetUser.role_code as UserRoleCode,
          activeAdminCount,
        });

        if (!check.allowed) {
          return res.status(403).json({ error: check.errorBn });
        }

        // Preserve historical record names while safely unlinking foreign keys before deleting user row
        await db.query(`UPDATE injury_registers SET created_by = NULL WHERE created_by = $1`, [
          targetId,
        ]);
        await db.query(`UPDATE injury_registers SET verified_by = NULL WHERE verified_by = $1`, [
          targetId,
        ]);
        await db.query(`UPDATE injury_registers SET approved_by = NULL WHERE approved_by = $1`, [
          targetId,
        ]);
        await db.query(`UPDATE attachments SET uploaded_by = NULL WHERE uploaded_by = $1`, [
          targetId,
        ]);
        await db.query(`UPDATE attachments SET deleted_by = NULL WHERE deleted_by = $1`, [
          targetId,
        ]);
        await db.query(`UPDATE review_history SET actor_id = NULL WHERE actor_id = $1`, [
          targetId,
        ]);
        await db.query(`UPDATE record_revisions SET changed_by = NULL WHERE changed_by = $1`, [
          targetId,
        ]);
        await db.query(`UPDATE backup_logs SET triggered_by = NULL WHERE triggered_by = $1`, [
          targetId,
        ]);

        await db.query(`DELETE FROM users WHERE id = $1`, [targetId]);

        await logAudit(
          actor,
          'USER_DELETE',
          `ব্যবহারকারী "${targetUser.full_name_bn}" (${targetUser.username} - ${ROLE_LABELS_BN[targetUser.role_code as UserRoleCode] || targetUser.role_code}) অ্যাকাউন্টটি সিস্টেম থেকে বাতিল/ডিলিট করা হয়েছে। কারণ: ${reasonBn}`
        );

        return res.json({
          success: true,
          deletedUserId: targetId,
          deletedUserNameBn: targetUser.full_name_bn,
        });
      } catch (error) {
        console.error('Delete user error:', error);
        return res.status(500).json({ error: 'ব্যবহারকারী ডিলিট করতে সার্ভার ত্রুটি ঘটেছে।' });
      }
    }
  );


  // -------------------------------------------------------------------------
  // AUDIT LOGS ENDPOINT (Module I)
  // -------------------------------------------------------------------------
  app.get(
    '/api/audit-logs',
    requireAuth,
    requirePermission('AUDIT_VIEW'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const db = await getDb();
        const limit = Math.min(Number(req.query.limit || 100), 500);
        const logsRes = await db.query(
          `SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT $1`,
          [limit]
        );
        return res.json({
          logs: logsRes.rows.map((l: any) => ({
            id: l.id,
            actorId: l.actor_id,
            actorNameBn: l.actor_name_bn,
            actorRoleCode: l.actor_role_code,
            actorRoleBn: ROLE_LABELS_BN[l.actor_role_code as UserRoleCode] || l.actor_role_code,
            actionCode: l.action_code,
            targetRecordId: l.target_record_id,
            targetRegistrationNo: l.target_registration_no,
            descriptionBn: l.description_bn,
            ipAddress: l.ip_address,
            createdAt: l.created_at,
          })),
        });
      } catch (error) {
        console.error('Get audit logs error:', error);
        return res.status(500).json({ error: 'অডিট লগ লোড করতে সমস্যা হয়েছে।' });
      }
    }
  );

  // -------------------------------------------------------------------------
  // BACKUP & RECOVERY ENDPOINTS (Module J)
  // -------------------------------------------------------------------------
  app.get(
    '/api/backups',
    requireAuth,
    async (_req: AuthenticatedRequest, res: Response) => {
      try {
        const db = await getDb();
        const backupsRes = await db.query(
          `SELECT * FROM backup_logs ORDER BY created_at DESC, id DESC`
        );
        return res.json({
          databaseMode: db.mode,
          backups: backupsRes.rows.map((b: any) => ({
            id: b.id,
            backupFileName: b.backup_file_name,
            backupPath: b.backup_path,
            fileSizeBytes: Number(b.file_size_bytes),
            recordsCount: Number(b.records_count),
            attachmentsCount: Number(b.attachments_count),
            checksumSha256: b.checksum_sha256,
            status: b.status,
            triggeredByNameBn: b.triggered_by_name_bn,
            verificationNotesBn: b.verification_notes_bn,
            createdAt: b.created_at,
          })),
        });
      } catch (error) {
        console.error('Get backups error:', error);
        return res.status(500).json({ error: 'ব্যাকআপ তালিকা লোড করতে সমস্যা হয়েছে।' });
      }
    }
  );

  app.post(
    '/api/backups',
    requireAuth,
    requirePermission('BACKUP_MANAGE'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const db = await getDb();
        const user = req.authUser!;
        const notesBn = String(
          req.body?.notesBn || 'প্রশাসনিক নির্দেশে পূর্ণাঙ্গ PostgreSQL ডাটাবেস ব্যাকআপ গ্রহণ'
        ).trim();

        const created = await createDatabaseBackupSnapshot(
          db,
          user.id,
          user.fullNameBn,
          notesBn
        );

        await logAudit(
          user,
          'BACKUP_CREATE',
          `নতুন PostgreSQL ডাটাবেস ব্যাকআপ (${created.backup_file_name}) সফলভাবে তৈরি ও সংরক্ষণ করা হয়েছে।`
        );

        return res.status(201).json({ backup: created });
      } catch (error) {
        console.error('Create backup error:', error);
        return res.status(500).json({ error: 'ডাটাবেস ব্যাকআপ তৈরি করতে সমস্যা হয়েছে।' });
      }
    }
  );

  app.post(
    '/api/backups/:id/verify',
    requireAuth,
    requirePermission('BACKUP_MANAGE'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const backupId = Number(req.params.id);
        const db = await getDb();
        const bRes = await db.query(`SELECT * FROM backup_logs WHERE id = $1 LIMIT 1`, [backupId]);
        const b = bRes.rows[0];
        if (!b) {
          return res.status(404).json({ error: 'ব্যাকআপ লগ পাওয়া যায়নি।' });
        }

        if (!fs.existsSync(b.backup_path)) {
          return res.status(404).json({ error: 'ডিস্কে ব্যাকআপ ফাইলটি পাওয়া যায়নি!' });
        }

        const rawContent = fs.readFileSync(b.backup_path, 'utf-8');
        const actualChecksum = crypto.createHash('sha256').update(rawContent).digest('hex');
        const parsed = JSON.parse(rawContent);

        const isIntegrityValid =
          actualChecksum === b.checksum_sha256 &&
          Array.isArray(parsed?.tables?.injury_registers) &&
          Array.isArray(parsed?.tables?.legal_details);

        const verifyMsg = isIntegrityValid
          ? `রিস্টোর ড্রাই-রান সফল: SHA-256 চেকসাম (${actualChecksum.slice(0, 12)}...) মিলেছে এবং ${parsed.tables.injury_registers.length}টি জখমী রেকর্ড ও ${parsed.tables.attachments?.length || 0}টি সংযুক্তি পুনরুদ্ধারযোগ্য।`
          : 'সতর্কতা: ব্যাকআপ ফাইলের চেকসাম মেলেনি!';

        await db.query(
          `UPDATE backup_logs SET status = $1, verification_notes_bn = $2 WHERE id = $3`,
          [isIntegrityValid ? 'VERIFIED' : 'FAILED', verifyMsg, backupId]
        );

        await logAudit(
          req.authUser!,
          'BACKUP_VERIFY',
          `ব্যাকআপ ফাইল (${b.backup_file_name}) রিস্টোর ও অখণ্ডতা পরীক্ষা করা হয়েছে: ${verifyMsg}`
        );

        return res.json({
          valid: isIntegrityValid,
          messageBn: verifyMsg,
          checksum: actualChecksum,
        });
      } catch (error) {
        console.error('Verify backup error:', error);
        return res.status(500).json({ error: 'ব্যাকআপ যাচাই প্রক্রিয়ায় ত্রুটি ঘটেছে।' });
      }
    }
  );

  app.get(
    '/api/backups/:id/download',
    requireAuth,
    requirePermission('BACKUP_MANAGE'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const backupId = Number(req.params.id);
        const db = await getDb();
        const bRes = await db.query(`SELECT * FROM backup_logs WHERE id = $1 LIMIT 1`, [backupId]);
        const b = bRes.rows[0];
        if (!b || !fs.existsSync(b.backup_path)) {
          return res.status(404).json({ error: 'ব্যাকআপ ফাইল পাওয়া যায়নি।' });
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${b.backup_file_name}"`);
        return res.sendFile(path.resolve(b.backup_path));
      } catch (error) {
        console.error('Download backup error:', error);
        return res.status(500).json({ error: 'ব্যাকআপ ফাইল ডাউনলোড করা যায়নি।' });
      }
    }
  );

  // Mount Vite middleware in development or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Hospital Injury Register Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
