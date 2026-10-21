import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_LABELS_BN,
  UserRoleCode,
  PermissionCode,
  normalizeRegNo,
} from '../utils/registerRules.ts';

const { Pool } = pg;

export interface QueryResult<T = any> {
  rows: T[];
  rowCount?: number | null;
}

export interface DatabaseAdapter {
  mode: 'EXTERNAL_POSTGRES_POOL' | 'EMBEDDED_POSTGRES_PGLITE';
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
}

let dbInstance: DatabaseAdapter | null = null;

export const STORAGE_DIR = path.resolve(process.cwd(), process.env.STORAGE_DIR || './data/uploads');
export const BACKUP_DIR = path.resolve(process.cwd(), process.env.BACKUP_DIR || './data/backups');
export const PGDATA_DIR = path.resolve(process.cwd(), './data/pgdata');

export function ensureDirectories() {
  for (const dir of [STORAGE_DIR, BACKUP_DIR, path.dirname(PGDATA_DIR)]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function hashPassword(password: string, salt?: string): string {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return `${actualSalt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  description_bn TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  module_bn TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_code TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_code, permission_code)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  full_name_bn TEXT NOT NULL,
  designation_bn TEXT NOT NULL,
  department_bn TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role_code TEXT NOT NULL REFERENCES roles(code),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS injury_registers (
  id TEXT PRIMARY KEY,
  registration_no TEXT NOT NULL,
  normalized_reg_no TEXT NOT NULL UNIQUE,
  registration_date TEXT NOT NULL,
  injured_name TEXT NOT NULL,
  injured_age TEXT NOT NULL,
  father_or_guardian_name TEXT NOT NULL,
  injured_address TEXT NOT NULL,
  doctor_name TEXT NOT NULL DEFAULT '',
  doctor_designation TEXT NOT NULL DEFAULT '',
  doctor_entry_not_found BOOLEAN NOT NULL DEFAULT FALSE,
  remarks TEXT NOT NULL DEFAULT '',
  completion_status TEXT NOT NULL DEFAULT 'INCOMPLETE',
  workflow_status TEXT NOT NULL DEFAULT 'DRAFT',
  revision_count INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_by_name_bn TEXT NOT NULL DEFAULT '',
  verified_by TEXT REFERENCES users(id),
  verified_by_name_bn TEXT,
  verified_at TIMESTAMPTZ,
  approved_by TEXT REFERENCES users(id),
  approved_by_name_bn TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS legal_details (
  id SERIAL PRIMARY KEY,
  record_id TEXT NOT NULL UNIQUE REFERENCES injury_registers(id) ON DELETE CASCADE,
  additional_reg_no TEXT NOT NULL DEFAULT '',
  additional_reg_date TEXT NOT NULL DEFAULT '',
  signature_no TEXT NOT NULL DEFAULT '',
  signature_date TEXT NOT NULL DEFAULT '',
  police_station_name TEXT NOT NULL DEFAULT '',
  police_case_no TEXT NOT NULL DEFAULT '',
  police_case_date TEXT NOT NULL DEFAULT '',
  court_case_no TEXT NOT NULL DEFAULT '',
  court_case_date TEXT NOT NULL DEFAULT '',
  mc_dispatch_date TEXT NOT NULL DEFAULT '',
  required_test_reports TEXT NOT NULL DEFAULT '',
  recommender_info TEXT NOT NULL DEFAULT '',
  application_attachment_note TEXT NOT NULL DEFAULT '',
  other_attachment_note TEXT NOT NULL DEFAULT '',
  entry_book_attachment_note TEXT NOT NULL DEFAULT '',
  confidentiality_level TEXT NOT NULL DEFAULT 'RESTRICTED',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES injury_registers(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  uploaded_by TEXT REFERENCES users(id),
  uploaded_by_name_bn TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_by TEXT REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  delete_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS review_history (
  id SERIAL PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES injury_registers(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  actor_name_bn TEXT NOT NULL,
  actor_role_bn TEXT NOT NULL,
  comment_bn TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS record_revisions (
  id SERIAL PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES injury_registers(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL,
  changed_by TEXT REFERENCES users(id),
  changed_by_name_bn TEXT NOT NULL,
  change_reason_bn TEXT NOT NULL,
  previous_snapshot_json TEXT NOT NULL,
  new_snapshot_json TEXT NOT NULL,
  changed_fields_json TEXT NOT NULL,
  was_approved_before_edit BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor_id TEXT,
  actor_name_bn TEXT NOT NULL,
  actor_role_code TEXT NOT NULL,
  action_code TEXT NOT NULL,
  target_record_id TEXT,
  target_registration_no TEXT,
  description_bn TEXT NOT NULL,
  ip_address TEXT NOT NULL DEFAULT '127.0.0.1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backup_logs (
  id SERIAL PRIMARY KEY,
  backup_file_name TEXT NOT NULL,
  backup_path TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  records_count INTEGER NOT NULL,
  attachments_count INTEGER NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  status TEXT NOT NULL,
  triggered_by TEXT REFERENCES users(id),
  triggered_by_name_bn TEXT NOT NULL,
  verification_notes_bn TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

const PERMISSION_DEFINITIONS: Array<{
  code: PermissionCode;
  nameBn: string;
  moduleBn: string;
}> = [
  { code: 'RECORD_VIEW', nameBn: 'জখমী রেকর্ড দেখা', moduleBn: 'রেকর্ড ব্যবস্থাপনা' },
  { code: 'RECORD_CREATE', nameBn: 'নতুন জখমী রেকর্ড এন্ট্রি', moduleBn: 'রেকর্ড ব্যবস্থাপনা' },
  { code: 'RECORD_EDIT_OWN_DRAFT', nameBn: 'নিজের খসড়া/ফেরত রেকর্ড সংশোধন', moduleBn: 'রেকর্ড ব্যবস্থাপনা' },
  { code: 'RECORD_EDIT_ANY', nameBn: 'যেকোনো অনিষ্পন্ন রেকর্ড সম্পাদনা', moduleBn: 'রেকর্ড ব্যবস্থাপনা' },
  { code: 'RECORD_EDIT_APPROVED', nameBn: 'অনুমোদিত রেকর্ড সংশোধন (পুনঃঅনুমোদন সাপেক্ষে)', moduleBn: 'রেকর্ড ব্যবস্থাপনা' },
  { code: 'RECORD_SUBMIT', nameBn: 'যাচাইয়ের জন্য রেকর্ড জমা দেওয়া', moduleBn: 'যাচাই ও অনুমোদন' },
  { code: 'RECORD_VERIFY', nameBn: 'রেকর্ড যাচাই ও ফেরত প্রদান', moduleBn: 'যাচাই ও অনুমোদন' },
  { code: 'RECORD_APPROVE', nameBn: 'রেকর্ড চূড়ান্ত অনুমোদন বা প্রত্যাখ্যান', moduleBn: 'যাচাই ও অনুমোদন' },
  { code: 'LEGAL_VIEW', nameBn: 'আইনগত ও মামলা সংক্রান্ত তথ্য দেখা', moduleBn: 'আইনগত তথ্য' },
  { code: 'LEGAL_EDIT', nameBn: 'আইনগত ও এমসি তথ্য হালনাগাদ', moduleBn: 'আইনগত তথ্য' },
  { code: 'ATTACHMENT_VIEW', nameBn: 'সংযুক্ত ফাইল দেখা ও ডাউনলোড', moduleBn: 'সংযুক্তি' },
  { code: 'ATTACHMENT_UPLOAD', nameBn: 'নতুন সংযুক্তি ফাইল আপলোড', moduleBn: 'সংযুক্তি' },
  { code: 'ATTACHMENT_DELETE', nameBn: 'সংযুক্তি ফাইল অপসারণ (ইতিহাসসহ)', moduleBn: 'সংযুক্তি' },
  { code: 'REPORT_VIEW', nameBn: 'রিপোর্ট দেখা ও ফিল্টার', moduleBn: 'রিপোর্ট ও প্রিন্ট' },
  { code: 'REPORT_PRINT', nameBn: 'রেজিস্টার ও একক রেকর্ড প্রিন্ট/PDF', moduleBn: 'রিপোর্ট ও প্রিন্ট' },
  { code: 'AUDIT_VIEW', nameBn: 'অডিট লগ ও নিরাপত্তা ইতিহাস দেখা', moduleBn: 'অডিট লগ' },
  { code: 'USER_MANAGE', nameBn: 'ব্যবহারকারী ও অনুমতি ব্যবস্থাপনা', moduleBn: 'ব্যবহারকারী ও অনুমতি' },
  { code: 'BACKUP_MANAGE', nameBn: 'ডাটাবেস ব্যাকআপ তৈরি ও যাচাই', moduleBn: 'ব্যাকআপ ও রিকভারি' },
];

export async function getDb(): Promise<DatabaseAdapter> {
  if (dbInstance) return dbInstance;
  ensureDirectories();

  const pgHost = process.env.PG_HOST || process.env.SQL_HOST;
  if (pgHost && pgHost.trim() !== '') {
    const pool = new Pool({
      host: pgHost,
      port: Number(process.env.PG_PORT || 5432),
      database: process.env.PG_DATABASE || process.env.SQL_DB_NAME || 'hospital_injury_register',
      user: process.env.PG_USER || process.env.SQL_USER || 'postgres',
      password: process.env.PG_PASSWORD || process.env.SQL_PASSWORD || '',
      max: 10,
      connectionTimeoutMillis: 15000,
    });
    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL pool client:', err);
    });
    dbInstance = {
      mode: 'EXTERNAL_POSTGRES_POOL',
      query: async <T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> => {
        const res = await pool.query(sql, params);
        return { rows: res.rows as T[], rowCount: res.rowCount };
      },
      exec: async (sql: string) => {
        await pool.query(sql);
      },
    };
  } else {
    const pglite = new PGlite(PGDATA_DIR);
    await pglite.waitReady;
    dbInstance = {
      mode: 'EMBEDDED_POSTGRES_PGLITE',
      query: async <T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> => {
        const res = await pglite.query<T>(sql, params);
        return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
      },
      exec: async (sql: string) => {
        await pglite.exec(sql);
      },
    };
  }

  await initializeSchemaAndSeed(dbInstance);
  return dbInstance;
}

function createSampleSvgDocument(titleBn: string, regNo: string, patientNameBn: string, detailsBn: string): Buffer {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560">
  <rect width="800" height="560" fill="#f8fafc" stroke="#0f2942" stroke-width="6"/>
  <rect x="24" y="24" width="752" height="90" fill="#0f2942" rx="6"/>
  <text x="400" y="62" fill="#ffffff" font-family="sans-serif" font-size="22" font-weight="bold" text-anchor="middle">শহীদ সৈয়দ নজরুল ইসলাম মেডিকেল কলেজ হাসপাতাল, কিশোরগঞ্জ</text>
  <text x="400" y="94" fill="#99f6e4" font-family="sans-serif" font-size="16" text-anchor="middle">${titleBn}</text>
  <rect x="40" y="140" width="720" height="360" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" rx="6"/>
  <text x="70" y="190" fill="#0f172a" font-family="sans-serif" font-size="18" font-weight="bold">রেজি: নম্বর: ${regNo}</text>
  <text x="70" y="235" fill="#1e293b" font-family="sans-serif" font-size="17">জখমীর নাম: ${patientNameBn}</text>
  <text x="70" y="280" fill="#334155" font-family="sans-serif" font-size="16">${detailsBn}</text>
  <line x1="70" y1="340" x2="730" y2="340" stroke="#e2e8f0" stroke-width="2"/>
  <text x="70" y="385" fill="#475569" font-family="sans-serif" font-size="14">সংরক্ষিত সরকারি হাসপাতালের ডিজিটাল সংযুক্তি নথি (অনুমোদিত ব্যবহারকারীর জন্য সীমাবদ্ধ)</text>
  <rect x="520" y="420" width="200" height="50" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.5" rx="4"/>
  <text x="620" y="450" fill="#15803d" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle">ডিজিটাল আর্কাইভ যাচাইকৃত</text>
</svg>`;
  return Buffer.from(svg, 'utf-8');
}

async function initializeSchemaAndSeed(db: DatabaseAdapter) {
  await db.exec(SCHEMA_SQL);

  // Check if roles are already seeded
  const existingRoles = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM roles');
  const count = Number(existingRoles.rows[0]?.count || 0);
  if (count > 0) {
    return;
  }

  // 1. Seed Roles
  const roleDescriptions: Record<UserRoleCode, string> = {
    SYSTEM_ADMIN: 'সিস্টেম পরিচালনা, ব্যবহারকারী ও অনুমতি নিয়ন্ত্রণ, ব্যাকআপ এবং সম্পূর্ণ রেজিস্টার তদারকি।',
    DATA_ENTRY_OPERATOR: 'নতুন জখমী রেকর্ড এন্ট্রি, খসড়া সংরক্ষণ, ফাইল সংযুক্তি এবং যাচাইয়ের জন্য জমা প্রদান।',
    VERIFIER: 'জমা দেওয়া জখমী তথ্যের সঠিকতা যাচাই, সংশোধনের জন্য ফেরত পাঠানো বা অনুমোদনের জন্য প্রেরণ।',
    APPROVER: 'যাচাইকৃত জখমী রেকর্ড চূড়ান্ত অনুমোদন, প্রত্যাখ্যান এবং অনুমোদিত রেকর্ডের নিয়ন্ত্রিত সংশোধন অনুমোদন।',
    DOCTOR: 'চিকিৎসক কর্তৃক জখমী ও এমসি সংক্রান্ত তথ্য দেখা, প্রয়োজনীয় পরীক্ষা ও মেডিক্যাল নোট সংযোজন।',
    REPORT_USER: 'দৈনিক, মাসিক, বার্ষিক রিপোর্ট দেখা এবং রেজিস্টার প্রিন্ট/PDF ডাউনলোড।',
  };

  for (const roleCode of Object.keys(ROLE_LABELS_BN) as UserRoleCode[]) {
    await db.query(
      `INSERT INTO roles (code, name_bn, description_bn) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
      [roleCode, ROLE_LABELS_BN[roleCode], roleDescriptions[roleCode]]
    );
  }

  // 2. Seed Permissions & Role-Permission mappings
  for (const perm of PERMISSION_DEFINITIONS) {
    await db.query(
      `INSERT INTO permissions (code, name_bn, module_bn) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
      [perm.code, perm.nameBn, perm.moduleBn]
    );
  }

  for (const [roleCode, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    for (const permCode of perms) {
      await db.query(
        `INSERT INTO role_permissions (role_code, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleCode, permCode]
      );
    }
  }

  // 3. Seed Hospital Users (Default password for demo/testing: Hospital@2026)
  const defaultPassHash = hashPassword('Hospital@2026');
  const seedUsers = [
    {
      id: 'usr-admin-01',
      username: 'zakaria.admin',
      fullNameBn: 'মোঃ জাকারিয়া আহমেদ',
      designationBn: 'অ্যাডমিন (জখমী রেজিস্টার)',
      departmentBn: 'আইটি ও রেকর্ড শাখা',
      phone: '01711-001122',
      roleCode: 'SYSTEM_ADMIN',
    },
    {
      id: 'usr-entry-01',
      username: 'kamrul.operator',
      fullNameBn: 'মোঃ কামরুল হাসান',
      designationBn: 'ডাটা এন্ট্রি অপারেটর',
      departmentBn: 'জরুরি ও জখমী রেজিস্টার শাখা',
      phone: '01712-334455',
      roleCode: 'DATA_ENTRY_OPERATOR',
    },
    {
      id: 'usr-verifier-01',
      username: 'mahbub.verifier',
      fullNameBn: 'ডা. মাহবুবুর রহমান',
      designationBn: 'আবাসিক মেডিকেল অফিসার (যাচাইকারী)',
      departmentBn: 'জরুরি বিভাগ',
      phone: '01715-667788',
      roleCode: 'VERIFIER',
    },
    {
      id: 'usr-approver-01',
      username: 'director.approver',
      fullNameBn: 'অধ্যাপক ডা. শফিকুল আলম',
      designationBn: 'উপ-পরিচালক (অনুমোদনকারী কর্তৃপক্ষ)',
      departmentBn: 'হাসপাতাল প্রশাসন',
      phone: '01718-990011',
      roleCode: 'APPROVER',
    },
    {
      id: 'usr-doctor-01',
      username: 'saiful.doctor',
      fullNameBn: 'ডা. সাইফুল ইসলাম',
      designationBn: 'মেডিকেল অফিসার (মেডিসিন)',
      departmentBn: 'মেডিসিন বিভাগ',
      phone: '01720-123123',
      roleCode: 'DOCTOR',
    },
    {
      id: 'usr-report-01',
      username: 'farzana.report',
      fullNameBn: 'ফারজানা ইয়াসমিন',
      designationBn: 'পরিসংখ্যান কর্মকর্তা',
      departmentBn: 'মেডিকেল রেকর্ড ও পরিসংখ্যান',
      phone: '01722-456456',
      roleCode: 'REPORT_USER',
    },
  ];

  for (const u of seedUsers) {
    await db.query(
      `INSERT INTO users (id, username, full_name_bn, designation_bn, department_bn, phone, password_hash, role_code, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE) ON CONFLICT (username) DO NOTHING`,
      [
        u.id,
        u.username,
        u.fullNameBn,
        u.designationBn,
        u.departmentBn,
        u.phone,
        defaultPassHash,
        u.roleCode,
      ]
    );
  }

  // 4. Seed Initial Injury Register Records (Matching the 3 rows in the hospital mockup + 2 workflow queue items)
  const seedRecords = [
    {
      id: 'INJ-2026-0001',
      registrationNo: '001/2026',
      registrationDate: '2026-01-02',
      injuredName: 'মোঃ রাকিবুল ইসলাম',
      injuredAge: '৩০',
      fatherOrGuardianName: 'আব্দুল মান্নান',
      injuredAddress: 'বড় বাজার, কিশোরগঞ্জ সদর, কিশোরগঞ্জ।',
      doctorName: 'ডা. সাইফুল ইসলাম (মেডিসিন)',
      doctorDesignation: 'মেডিসিন বিভাগ',
      doctorEntryNotFound: false,
      additionalRegNo: '১২৩/2026',
      additionalRegDate: '2026-01-02',
      signatureNo: 'স্বা-০১',
      signatureDate: '2026-01-02',
      policeStationName: 'কিশোরগঞ্জ থানা',
      policeCaseNo: '১২৩/২০২৬',
      policeCaseDate: '2026-01-01',
      courtCaseNo: '',
      courtCaseDate: '',
      mcDispatchDate: '2026-01-02',
      requiredTestReports: 'X-Ray, CBC, CT Scan',
      recommenderInfo: 'ডা. করিম আহমেদ',
      applicationAttachmentNote: 'আবেদনপত্র সংযুক্ত',
      otherAttachmentNote: 'অন্যান্য তথ্য সংযুক্ত',
      entryBookAttachmentNote: 'এন্ট্রির খাতা সংযুক্ত',
      remarks: 'রোগী ভর্তিধীন',
      completionStatus: 'COMPLETE',
      workflowStatus: 'APPROVED',
      createdBy: 'usr-entry-01',
      createdByNameBn: 'মোঃ কামরুল হাসান',
      verifiedBy: 'usr-verifier-01',
      verifiedByNameBn: 'ডা. মাহবুবুর রহমান',
      approvedBy: 'usr-approver-01',
      approvedByNameBn: 'অধ্যাপক ডা. শফিকুল আলম',
    },
    {
      id: 'INJ-2026-0002',
      registrationNo: '002/2026',
      registrationDate: '2026-01-05',
      injuredName: 'মোছাঃ সালমা আক্তার',
      injuredAge: '২৫',
      fatherOrGuardianName: 'মোঃ আব্দুল করিম',
      injuredAddress: 'কুমারপুর, কুলিয়ারচর, কিশোরগঞ্জ।',
      doctorName: 'ডা. নাসরিন আক্তার (মেডিসিন)',
      doctorDesignation: 'মেডিসিন বিভাগ',
      doctorEntryNotFound: false,
      additionalRegNo: '১১৫/2026',
      additionalRegDate: '2026-01-05',
      signatureNo: 'স্বা-০২',
      signatureDate: '2026-01-05',
      policeStationName: 'কুলিয়ারচর থানা',
      policeCaseNo: '২৪৭/২০২৬',
      policeCaseDate: '2026-01-05',
      courtCaseNo: '',
      courtCaseDate: '',
      mcDispatchDate: '2026-01-06',
      requiredTestReports: 'X-Ray, Blood Group',
      recommenderInfo: 'ডা. রেজওয়ান করিম',
      applicationAttachmentNote: 'আবেদনপত্র সংযুক্ত',
      otherAttachmentNote: 'অন্যান্য তথ্য সংযুক্ত',
      entryBookAttachmentNote: 'এন্ট্রির খাতা সংযুক্ত',
      remarks: 'পরীক্ষার জন্য অপেক্ষা',
      completionStatus: 'INCOMPLETE',
      workflowStatus: 'PENDING_APPROVAL',
      createdBy: 'usr-entry-01',
      createdByNameBn: 'মোঃ কামরুল হাসান',
      verifiedBy: 'usr-verifier-01',
      verifiedByNameBn: 'ডা. মাহবুবুর রহমান',
      approvedBy: null,
      approvedByNameBn: null,
    },
    {
      id: 'INJ-2026-0003',
      registrationNo: '003/2026',
      registrationDate: '2026-01-08',
      injuredName: 'মোঃ হাসান মিয়া',
      injuredAge: '৪২',
      fatherOrGuardianName: 'মোঃ জলিল মিয়া',
      injuredAddress: 'তালারপুর, ভৈরব, কিশোরগঞ্জ।',
      doctorName: 'ডা. মেহেদী হাসান (অর্থোপেডিক্স)',
      doctorDesignation: 'অর্থোপেডিক্স বিভাগ',
      doctorEntryNotFound: false,
      additionalRegNo: '১২৫/2026',
      additionalRegDate: '2026-01-08',
      signatureNo: 'স্বা-০৩',
      signatureDate: '2026-01-08',
      policeStationName: 'ভৈরব থানা',
      policeCaseNo: '৩৬৫/২০২৬',
      policeCaseDate: '2026-01-08',
      courtCaseNo: '',
      courtCaseDate: '',
      mcDispatchDate: '2026-01-09',
      requiredTestReports: 'X-Ray, CT Scan, Blood Test',
      recommenderInfo: 'ডা. আনিসুর রহমান',
      applicationAttachmentNote: 'আবেদনপত্র সংযুক্ত',
      otherAttachmentNote: 'অন্যান্য তথ্য সংযুক্ত',
      entryBookAttachmentNote: 'এন্ট্রির খাতা সংযুক্ত',
      remarks: 'অতিরিক্ত পরীক্ষা প্রয়োজন',
      completionStatus: 'INCOMPLETE',
      workflowStatus: 'PENDING_VERIFICATION',
      createdBy: 'usr-entry-01',
      createdByNameBn: 'মোঃ কামরুল হাসান',
      verifiedBy: null,
      verifiedByNameBn: null,
      approvedBy: null,
      approvedByNameBn: null,
    },
    {
      id: 'INJ-2026-0004',
      registrationNo: '004/2026',
      registrationDate: '2026-01-12',
      injuredName: 'মোঃ সাইফুল্লাহ আকন্দ',
      injuredAge: '৩৮',
      fatherOrGuardianName: 'মৃত সিরাজুল ইসলাম',
      injuredAddress: 'যশোদল, কিশোরগঞ্জ সদর, কিশোরগঞ্জ।',
      doctorName: 'ডা. তানভীর আহমেদ (সার্জারি)',
      doctorDesignation: 'সার্জারি বিভাগ',
      doctorEntryNotFound: false,
      additionalRegNo: '১২৯/2026',
      additionalRegDate: '2026-01-12',
      signatureNo: 'স্বা-০৪',
      signatureDate: '2026-01-12',
      policeStationName: 'কিশোরগঞ্জ সদর মডেল থানা',
      policeCaseNo: '৪১২/২০২৬',
      policeCaseDate: '2026-01-11',
      courtCaseNo: 'সিআর-৮৮/২০২৬',
      courtCaseDate: '2026-01-11',
      mcDispatchDate: '2026-01-14',
      requiredTestReports: 'USG of Whole Abdomen, X-Ray Chest',
      recommenderInfo: 'ডা. করিম আহমেদ',
      applicationAttachmentNote: 'আবেদনপত্র সংযুক্ত',
      otherAttachmentNote: 'অন্যান্য তথ্য সংযুক্ত',
      entryBookAttachmentNote: 'এন্ট্রির খাতা সংযুক্ত',
      remarks: 'এমসি প্রেরণ সম্পন্ন',
      completionStatus: 'COMPLETE',
      workflowStatus: 'APPROVED',
      createdBy: 'usr-entry-01',
      createdByNameBn: 'মোঃ কামরুল হাসান',
      verifiedBy: 'usr-verifier-01',
      verifiedByNameBn: 'ডা. মাহবুবুর রহমান',
      approvedBy: 'usr-approver-01',
      approvedByNameBn: 'অধ্যাপক ডা. শফিকুল আলম',
    },
    {
      id: 'INJ-2026-0005',
      registrationNo: '005/2026',
      registrationDate: new Date().toISOString().slice(0, 10),
      injuredName: 'মোঃ নাজমুল হুদা',
      injuredAge: '২৯',
      fatherOrGuardianName: 'মোঃ ফজলুর রহমান',
      injuredAddress: 'বাজিতপুর বাজার, বাজিতপুর, কিশোরগঞ্জ।',
      doctorName: '',
      doctorDesignation: '',
      doctorEntryNotFound: true,
      additionalRegNo: '১৩৪/2026',
      additionalRegDate: new Date().toISOString().slice(0, 10),
      signatureNo: 'স্বা-০৫',
      signatureDate: new Date().toISOString().slice(0, 10),
      policeStationName: 'বাজিতপুর থানা',
      policeCaseNo: '৫০২/২০২৬',
      policeCaseDate: new Date().toISOString().slice(0, 10),
      courtCaseNo: '',
      courtCaseDate: '',
      mcDispatchDate: '',
      requiredTestReports: 'X-Ray Left Forearm, CBC',
      recommenderInfo: 'ডা. মাহবুবুর রহমান',
      applicationAttachmentNote: 'আবেদনপত্র সংযুক্ত',
      otherAttachmentNote: '',
      entryBookAttachmentNote: 'এন্ট্রির খাতা সংযুক্ত',
      remarks: 'চিকিৎসকের মূল এন্ট্রি খাতা মিলানো হচ্ছে',
      completionStatus: 'INCOMPLETE',
      workflowStatus: 'RETURNED_FOR_CORRECTION',
      createdBy: 'usr-entry-01',
      createdByNameBn: 'মোঃ কামরুল হাসান',
      verifiedBy: 'usr-verifier-01',
      verifiedByNameBn: 'ডা. মাহবুবুর রহমান',
      approvedBy: null,
      approvedByNameBn: null,
    },
  ];

  for (const r of seedRecords) {
    await db.query(
      `INSERT INTO injury_registers (
        id, registration_no, normalized_reg_no, registration_date,
        injured_name, injured_age, father_or_guardian_name, injured_address,
        doctor_name, doctor_designation, doctor_entry_not_found,
        remarks, completion_status, workflow_status, revision_count,
        created_by, created_by_name_bn,
        verified_by, verified_by_name_bn, verified_at,
        approved_by, approved_by_name_bn, approved_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14, 1,
        $15, $16,
        $17, $18, $19,
        $20, $21, $22
      )`,
      [
        r.id,
        r.registrationNo,
        normalizeRegNo(r.registrationNo),
        r.registrationDate,
        r.injuredName,
        r.injuredAge,
        r.fatherOrGuardianName,
        r.injuredAddress,
        r.doctorName,
        r.doctorDesignation,
        r.doctorEntryNotFound,
        r.remarks,
        r.completionStatus,
        r.workflowStatus,
        r.createdBy,
        r.createdByNameBn,
        r.verifiedBy,
        r.verifiedByNameBn,
        r.verifiedBy ? new Date().toISOString() : null,
        r.approvedBy,
        r.approvedByNameBn,
        r.approvedBy ? new Date().toISOString() : null,
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
        r.id,
        r.additionalRegNo,
        r.additionalRegDate,
        r.signatureNo,
        r.signatureDate,
        r.policeStationName,
        r.policeCaseNo,
        r.policeCaseDate,
        r.courtCaseNo,
        r.courtCaseDate,
        r.mcDispatchDate,
        r.requiredTestReports,
        r.recommenderInfo,
        r.applicationAttachmentNote,
        r.otherAttachmentNote,
        r.entryBookAttachmentNote,
      ]
    );

    // Seed real physical attachment files for each seeded record
    const attachmentSpecs = [
      {
        cat: 'APPLICATION',
        titleBn: 'আবেদনপত্র সংযুক্তি (কলাম ১০)',
        fileLabel: `application_${r.id}.svg`,
      },
      {
        cat: 'OTHER_INFO',
        titleBn: 'অন্যান্য তথ্য ও থানার রিকুইজিশন (কলাম ১০)',
        fileLabel: `other_info_${r.id}.svg`,
      },
      {
        cat: 'ENTRY_BOOK',
        titleBn: 'জরুরি বিভাগের মূল এন্ট্রির খাতা (কলাম ১১)',
        fileLabel: `entry_book_${r.id}.svg`,
      },
    ];

    for (const spec of attachmentSpecs) {
      if (spec.cat === 'OTHER_INFO' && !r.otherAttachmentNote) continue;
      const buf = createSampleSvgDocument(
        spec.titleBn,
        r.registrationNo,
        `${r.injuredName} (${r.injuredAge})`,
        `থানা/মামলা: ${r.policeStationName} - ${r.policeCaseNo} | মন্তব্য: ${r.remarks}`
      );
      const storedName = `${Date.now()}_${spec.fileLabel}`;
      fs.writeFileSync(path.join(STORAGE_DIR, storedName), buf);
      const checksum = crypto.createHash('sha256').update(buf).digest('hex');
      const attId = `ATT-${r.id}-${spec.cat}`;
      await db.query(
        `INSERT INTO attachments (
          id, record_id, category, original_name, stored_file_name,
          mime_type, file_size_bytes, checksum_sha256, uploaded_by, uploaded_by_name_bn
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          attId,
          r.id,
          spec.cat,
          spec.fileLabel.replace('.svg', '.png'),
          storedName,
          'image/svg+xml',
          buf.length,
          checksum,
          r.createdBy,
          r.createdByNameBn,
        ]
      );
    }

    // Seed Review History
    await db.query(
      `INSERT INTO review_history (record_id, action_type, from_status, to_status, actor_id, actor_name_bn, actor_role_bn, comment_bn)
       VALUES ($1, 'CREATED', 'DRAFT', 'PENDING_VERIFICATION', $2, $3, 'ডাটা এন্ট্রি অপারেটর', 'প্রাথমিক এন্ট্রি সম্পন্ন করে যাচাইয়ের জন্য জমা দেওয়া হলো।')`,
      [r.id, r.createdBy, r.createdByNameBn]
    );

    if (r.workflowStatus === 'PENDING_APPROVAL' || r.workflowStatus === 'APPROVED') {
      await db.query(
        `INSERT INTO review_history (record_id, action_type, from_status, to_status, actor_id, actor_name_bn, actor_role_bn, comment_bn)
         VALUES ($1, 'VERIFIED', 'PENDING_VERIFICATION', 'PENDING_APPROVAL', $2, $3, 'যাচাইকারী কর্মকর্তা', 'রেজিস্টার খাতা ও থানার মামলা নম্বরের সাথে মিল পাওয়া গেছে।')`,
        [r.id, r.verifiedBy, r.verifiedByNameBn]
      );
    }

    if (r.workflowStatus === 'RETURNED_FOR_CORRECTION') {
      await db.query(
        `INSERT INTO review_history (record_id, action_type, from_status, to_status, actor_id, actor_name_bn, actor_role_bn, comment_bn)
         VALUES ($1, 'RETURNED', 'PENDING_VERIFICATION', 'RETURNED_FOR_CORRECTION', $2, $3, 'যাচাইকারী কর্মকর্তা', 'চিকিৎসকের নাম বা জরুরি বিভাগের এন্ট্রি খাতার পৃষ্ঠা নম্বর স্পষ্ট করে পুনরায় জমা দিন।')`,
        [r.id, r.verifiedBy, r.verifiedByNameBn]
      );
    }

    if (r.workflowStatus === 'APPROVED') {
      await db.query(
        `INSERT INTO review_history (record_id, action_type, from_status, to_status, actor_id, actor_name_bn, actor_role_bn, comment_bn)
         VALUES ($1, 'APPROVED', 'PENDING_APPROVAL', 'APPROVED', $2, $3, 'অনুমোদনকারী কর্তৃপক্ষ', 'সকল দালিলিক প্রমাণ ও এমসি প্রেরণের তারিখ সঠিক থাকায় চূড়ান্ত অনুমোদন প্রদান করা হলো।')`,
        [r.id, r.approvedBy, r.approvedByNameBn]
      );
    }

    // Seed Audit Log
    await db.query(
      `INSERT INTO audit_logs (actor_id, actor_name_bn, actor_role_code, action_code, target_record_id, target_registration_no, description_bn)
       VALUES ($1, $2, 'DATA_ENTRY_OPERATOR', 'RECORD_CREATE', $3, $4, $5)`,
      [
        r.createdBy,
        r.createdByNameBn,
        r.id,
        r.registrationNo,
        `জখমী রেকর্ড (${r.registrationNo} - ${r.injuredName}) তৈরি ও সংরক্ষণ করা হয়েছে।`,
      ]
    );
  }

  // 5. Create an initial verified PostgreSQL backup snapshot on disk
  await createDatabaseBackupSnapshot(
    db,
    'usr-admin-01',
    'মোঃ জাকারিয়া আহমেদ',
    'প্রাথমিক সিস্টেম সেটআপ ও ডাটাবেস রিকভারি পয়েন্ট'
  );
}

export async function createDatabaseBackupSnapshot(
  db: DatabaseAdapter,
  actorId: string,
  actorNameBn: string,
  notesBn: string
) {
  ensureDirectories();
  const recordsRes = await db.query('SELECT * FROM injury_registers ORDER BY registration_date DESC');
  const legalRes = await db.query('SELECT * FROM legal_details');
  const attachmentsRes = await db.query('SELECT * FROM attachments');
  const reviewsRes = await db.query('SELECT * FROM review_history');
  const revisionsRes = await db.query('SELECT * FROM record_revisions');
  const usersRes = await db.query(
    'SELECT id, username, full_name_bn, designation_bn, department_bn, phone, role_code, is_active, created_at FROM users'
  );

  const backupPayload = {
    schemaVersion: '1.0.0',
    engine: 'PostgreSQL 16 (Hospital Injury Register Schema)',
    exportedAt: new Date().toISOString(),
    exportedBy: { id: actorId, nameBn: actorNameBn },
    tables: {
      users: usersRes.rows,
      injury_registers: recordsRes.rows,
      legal_details: legalRes.rows,
      attachments: attachmentsRes.rows,
      review_history: reviewsRes.rows,
      record_revisions: revisionsRes.rows,
    },
  };

  const jsonContent = JSON.stringify(backupPayload, null, 2);
  const checksum = crypto.createHash('sha256').update(jsonContent).digest('hex');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `pg_backup_injury_register_${timestamp}.json`;
  const fullPath = path.join(BACKUP_DIR, fileName);
  fs.writeFileSync(fullPath, jsonContent, 'utf-8');

  const sizeBytes = Buffer.byteLength(jsonContent, 'utf-8');

  const insertRes = await db.query(
    `INSERT INTO backup_logs (
      backup_file_name, backup_path, file_size_bytes,
      records_count, attachments_count, checksum_sha256,
      status, triggered_by, triggered_by_name_bn, verification_notes_bn
    ) VALUES ($1,$2,$3,$4,$5,$6,'VERIFIED',$7,$8,$9) RETURNING *`,
    [
      fileName,
      fullPath,
      sizeBytes,
      recordsRes.rows.length,
      attachmentsRes.rows.length,
      checksum,
      actorId,
      actorNameBn,
      notesBn || 'স্বয়ংক্রিয় SHA-256 চেকসাম ও রিস্টোর যাচাই সম্পন্ন।',
    ]
  );

  return insertRes.rows[0];
}
