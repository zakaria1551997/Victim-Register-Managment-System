import React, { useState, useEffect } from 'react';
import {
  Users,
  Shield,
  Database,
  FileCheck2,
  Download,
  Plus,
  RefreshCw,
  CheckCircle2,
  Lock,
  Server,
  HardDriveDownload,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { UserSession } from '../types';
import {
  ROLE_LABELS_BN,
  UserRoleCode,
  toBengaliDigits,
} from '../utils/registerRules';

interface AdminAndSecurityPanelsProps {
  activeSubTab: 'USERS' | 'AUDIT' | 'BACKUP_ARCH';
  currentUser: UserSession;
  authToken: string;
  onUsersChanged?: () => void;
}

export const AdminAndSecurityPanels: React.FC<AdminAndSecurityPanelsProps> = ({
  activeSubTab,
  currentUser,
  authToken,
  onUsersChanged,
}) => {
  const [usersList, setUsersList] = useState<any[]>([]);
  const [rolesList, setRolesList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [dbMode, setDbMode] = useState<string>('EMBEDDED_POSTGRES_PGLITE');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // New user form
  const [newUsername, setNewUsername] = useState('');
  const [newFullNameBn, setNewFullNameBn] = useState('');
  const [newDesignationBn, setNewDesignationBn] = useState('');
  const [newDepartmentBn, setNewDepartmentBn] = useState('জরুরি বিভাগ');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRoleCode, setNewRoleCode] = useState<UserRoleCode>('DATA_ENTRY_OPERATOR');

  // Delete user confirmation state
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<any | null>(null);
  const [deleteUserReasonBn, setDeleteUserReasonBn] = useState<string>('');

  // Backup notes
  const [backupNotesBn, setBackupNotesBn] = useState('');
  const [busy, setBusy] = useState(false);

  const loadData = async () => {
    setErrorMessage('');
    try {
      if (activeSubTab === 'USERS') {
        const res = await fetch('/api/users', {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUsersList(data.users || []);
          setRolesList(data.roles || []);
        }
      } else if (activeSubTab === 'AUDIT') {
        const res = await fetch('/api/audit-logs?limit=150', {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAuditLogs(data.logs || []);
        } else {
          const err = await res.json();
          setErrorMessage(err.error || 'অডিট লগ দেখার অনুমতি নেই।');
        }
      } else if (activeSubTab === 'BACKUP_ARCH') {
        const res = await fetch('/api/backups', {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setBackups(data.backups || []);
          setDbMode(data.databaseMode || 'EMBEDDED_POSTGRES_PGLITE');
        }
      }
    } catch {
      setErrorMessage('তথ্য লোড করতে সমস্যা হয়েছে।');
    }
  };

  useEffect(() => {
    loadData();
  }, [activeSubTab, authToken]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage('');
    setErrorMessage('');
    setBusy(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          username: newUsername,
          fullNameBn: newFullNameBn,
          designationBn: newDesignationBn,
          departmentBn: newDepartmentBn,
          phone: newPhone,
          password: newPassword,
          roleCode: newRoleCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'ব্যবহারকারী তৈরি করা যায়নি।');
      } else {
        setStatusMessage(`নতুন ব্যবহারকারী "${newFullNameBn}" সফলভাবে তৈরি হয়েছে।`);
        setNewUsername('');
        setNewFullNameBn('');
        setNewDesignationBn('');
        setNewPhone('');
        setNewPassword('');
        await loadData();
        onUsersChanged?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleToggleUserActive = async (userId: string, currentActive: boolean) => {
    setStatusMessage('');
    setErrorMessage('');
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ isActive: !currentActive }),
    });
    if (res.ok) {
      setStatusMessage(
        !currentActive
          ? 'ব্যবহারকারী অ্যাকাউন্ট পুনরায় সক্রিয় করা হয়েছে।'
          : 'ব্যবহারকারী অ্যাকাউন্ট সাময়িকভাবে নিষ্ক্রিয় করা হয়েছে।'
      );
      await loadData();
      onUsersChanged?.();
    } else {
      const data = await res.json();
      setErrorMessage(data.error || 'পরিবর্তন ব্যর্থ হয়েছে।');
    }
  };

  const handleChangeUserRole = async (userId: string, roleCode: string) => {
    setStatusMessage('');
    setErrorMessage('');
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ roleCode }),
    });
    if (res.ok) {
      setStatusMessage('ব্যবহারকারীর ভূমিকা (Role) হালনাগাদ করা হয়েছে।');
      await loadData();
      onUsersChanged?.();
    } else {
      const data = await res.json();
      setErrorMessage(data.error || 'ভূমিকা পরিবর্তন করা যায়নি।');
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!confirmDeleteUser) return;
    setStatusMessage('');
    setErrorMessage('');
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${confirmDeleteUser.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          reasonBn:
            deleteUserReasonBn.trim() ||
            'প্রশাসনিক সিদ্ধান্তে ব্যবহারকারী অ্যাকাউন্ট বাতিল/ডিলিট',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'ব্যবহারকারী ডিলিট করা যায়নি।');
      } else {
        setStatusMessage(
          `ব্যবহারকারী "${confirmDeleteUser.fullNameBn}" (${confirmDeleteUser.username}) সফলভাবে বাতিল ও ডিলিট করা হয়েছে।`
        );
        setConfirmDeleteUser(null);
        setDeleteUserReasonBn('');
        await loadData();
        onUsersChanged?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreateBackup = async () => {
    setStatusMessage('');
    setErrorMessage('');
    setBusy(true);
    try {
      const res = await fetch('/api/backups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          notesBn:
            backupNotesBn.trim() || 'ম্যানুয়াল পূর্ণাঙ্গ PostgreSQL স্ন্যাপশট ও চেকসাম ব্যাকআপ',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'ব্যাকআপ তৈরি ব্যর্থ হয়েছে।');
      } else {
        setStatusMessage(
          `নতুন PostgreSQL ব্যাকআপ ফাইল (${data.backup.backup_file_name}) সফলভাবে তৈরি ও সংরক্ষিত হয়েছে।`
        );
        setBackupNotesBn('');
        await loadData();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyBackup = async (backupId: number) => {
    setStatusMessage('');
    setErrorMessage('');
    setBusy(true);
    try {
      const res = await fetch(`/api/backups/${backupId}/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(data.messageBn);
        await loadData();
      } else {
        setErrorMessage(data.error || 'ব্যাকআপ যাচাই ব্যর্থ হয়েছে।');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {statusMessage && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {errorMessage}
        </div>
      )}

      {/* TAB 1: USERS & ROLES MANAGEMENT (Module F) */}
      {activeSubTab === 'USERS' && (
        <div className="space-y-6">
          {/* Inline Confirmation Banner when Admin clicks Delete User */}
          {confirmDeleteUser && (
            <div
              role="alertdialog"
              aria-label="ব্যবহারকারী বাতিল/ডিলিট নিশ্চিতকরণ"
              className="bg-rose-50 border-2 border-rose-300 rounded-xl p-5 shadow-xs space-y-3"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <h3 className="text-sm font-bold text-rose-950">
                    ব্যবহারকারী বাতিল / ডিলিট নিশ্চিত করুন: {confirmDeleteUser.fullNameBn} (
                    {confirmDeleteUser.username})
                  </h3>
                  <p className="text-xs text-rose-800">
                    এই ব্যবহারকারীকে ডিলিট করলে তিনি আর সিস্টেমে লগইন করতে পারবেন না। তবে তার পূর্বে এন্ট্রিকৃত বা যাচাইকৃত জখমী রেকর্ডে তার নাম ও অডিট লগ অক্ষুণ্ণ থাকবে।
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-1">
                <div className="md:col-span-8">
                  <label
                    htmlFor="delete-user-reason-input"
                    className="block text-xs font-bold text-rose-950 mb-1"
                  >
                    বাতিল / ডিলিট করার কারণ (অডিট লগে সংরক্ষিত হবে)
                  </label>
                  <input
                    id="delete-user-reason-input"
                    type="text"
                    value={deleteUserReasonBn}
                    onChange={(e) => setDeleteUserReasonBn(e.target.value)}
                    placeholder="যেমন: বদলিজনিত কারণে বা দায়িত্ব শেষ হওয়ায় অ্যাকাউন্ট বাতিল..."
                    className="w-full px-3 py-2 text-xs bg-white border border-rose-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div className="md:col-span-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteUser(null);
                      setDeleteUserReasonBn('');
                    }}
                    className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    ফিরে যান
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleConfirmDeleteUser}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>নিশ্চিত ডিলিট করুন</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-[#0f2942] flex items-center gap-2">
                <Users className="w-5 h-5 text-[#0d6e6e]" />
                <span>ব্যবহারকারী ও ভূমিকাভিত্তিক অনুমতি ব্যবস্থাপনা (Module F — RBAC)</span>
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                সকল পাসওয়ার্ড সার্ভার সাইডে <code>crypto.scrypt</code> সল্টসহ হ্যাশ করা এবং অ্যাডমিন এখান থেকে ব্যবহারকারী তৈরি, ভূমিকা পরিবর্তন, নিষ্ক্রিয় অথবা স্থায়ীভাবে বাতিল/ডিলিট করতে পারবেন।
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-200">
                    <th className="py-2.5 px-3">পূর্ণ নাম ও পদবী</th>
                    <th className="py-2.5 px-3">ইউজারনেম</th>
                    <th className="py-2.5 px-3">বিভাগ ও ফোন</th>
                    <th className="py-2.5 px-3">নির্ধারিত ভূমিকা (Role)</th>
                    <th className="py-2.5 px-3">অবস্থা</th>
                    <th className="py-2.5 px-3 text-right">প্রশাসনিক নিয়ন্ত্রণ (সক্রিয়/বাতিল/ডিলিট)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {usersList.map((u) => {
                    const isSelf = u.id === currentUser.id;
                    return (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">
                            {u.fullNameBn}{' '}
                            {isSelf && (
                              <span className="text-[11px] font-normal text-teal-700">
                                (আপনি)
                              </span>
                            )}
                          </div>
                          <div className="text-slate-500">{u.designationBn}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono-tabular font-medium">
                          {u.username}
                        </td>
                        <td className="py-2.5 px-3">
                          <div>{u.departmentBn}</div>
                          <div className="text-slate-500 font-mono-tabular">{u.phone}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          {currentUser.permissions.includes('USER_MANAGE') ? (
                            <select
                              aria-label={`${u.fullNameBn}-এর ভূমিকা পরিবর্তন`}
                              value={u.roleCode}
                              onChange={(e) => handleChangeUserRole(u.id, e.target.value)}
                              className="px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                            >
                              {Object.entries(ROLE_LABELS_BN).map(([code, label]) => (
                                <option key={code} value={code}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-semibold text-[#0f2942]">{u.roleNameBn}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {u.isActive ? (
                            <span className="text-emerald-700 font-bold">সক্রিয়</span>
                          ) : (
                            <span className="text-rose-600 font-bold">নিষ্ক্রিয়</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {currentUser.permissions.includes('USER_MANAGE') ? (
                            <div className="inline-flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleUserActive(u.id, u.isActive)}
                                className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium cursor-pointer whitespace-nowrap"
                              >
                                {u.isActive ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
                              </button>
                              <button
                                type="button"
                                disabled={isSelf}
                                title={
                                  isSelf
                                    ? 'নিজের সক্রিয় অ্যাকাউন্ট ডিলিট করা যাবে না'
                                    : `${u.fullNameBn}-কে বাতিল/ডিলিট করুন`
                                }
                                aria-label={`বাতিল বা ডিলিট করুন ${u.fullNameBn}`}
                                onClick={() => {
                                  setConfirmDeleteUser(u);
                                  setDeleteUserReasonBn('');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>বাতিল / ডিলিট</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400">শুধুমাত্র অ্যাডমিন</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Create New User Form (Admin Only) */}
          {currentUser.permissions.includes('USER_MANAGE') && (
            <form
              onSubmit={handleCreateUser}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4"
            >
              <h3 className="text-sm font-bold text-[#0f2942] border-b border-slate-200 pb-2">
                নতুন ব্যবহারকারী তৈরি করুন (শুধুমাত্র System Admin)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    পূর্ণ নাম (বাংলায়) *
                  </label>
                  <input
                    type="text"
                    required
                    value={newFullNameBn}
                    onChange={(e) => setNewFullNameBn(e.target.value)}
                    placeholder="যেমন: ডা. তানভীর হাসান"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    লগইন ইউজারনেম *
                  </label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="যেমন: tanvir.doctor"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    প্রাথমিক পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর) *
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    পদবী *
                  </label>
                  <input
                    type="text"
                    required
                    value={newDesignationBn}
                    onChange={(e) => setNewDesignationBn(e.target.value)}
                    placeholder="যেমন: মেডিকেল অফিসার"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    বিভাগ / শাখা
                  </label>
                  <input
                    type="text"
                    value={newDepartmentBn}
                    onChange={(e) => setNewDepartmentBn(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ভূমিকা (Role) *
                  </label>
                  <select
                    value={newRoleCode}
                    onChange={(e) => setNewRoleCode(e.target.value as UserRoleCode)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {Object.entries(ROLE_LABELS_BN).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0d6e6e] hover:bg-[#0a5858] text-white text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>ব্যবহারকারী যুক্ত করুন</span>
                </button>
              </div>
            </form>
          )}

          {/* 6 Roles & Server-Side Permissions Matrix */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-[#0f2942]">
              ৬টি ভূমিকার সার্ভার-সাইড অনুমতি কাঠামো (Role-Permission Matrix)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rolesList.map((r) => (
                <div
                  key={r.code}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2 text-xs"
                >
                  <div className="font-bold text-[#0f2942]">{r.nameBn}</div>
                  <p className="text-slate-600 text-[11px]">{r.descriptionBn}</p>
                  <div className="pt-1 border-t border-slate-200 text-[11px] font-mono-tabular text-slate-700">
                    অনুমোদিত পারমিশন ({toBengaliDigits(r.permissions?.length || 0)}টি):{' '}
                    {(r.permissions || []).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: IMMUTABLE AUDIT LOGS (Module I) */}
      {activeSubTab === 'AUDIT' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-lg font-bold text-[#0f2942] flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#0d6e6e]" />
                <span>অপরিবর্তনীয় অডিট লগ (Immutable Security Audit Trail — Module I)</span>
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                কে কখন কোন রেকর্ড তৈরি, দেখেছে, সম্পাদনা, জমা, যাচাই, অনুমোদন বা ব্যবহারকারী বাতিল/ডিলিট করেছে তার পূর্ণাঙ্গ লগ। সাধারণ ব্যবহারকারী এটি পরিবর্তন বা মুছতে পারে না।
              </p>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-xs font-medium cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>রিফ্রেশ</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800 border-b border-slate-200">
                  <th className="py-2.5 px-3">লগ আইডি ও সময়</th>
                  <th className="py-2.5 px-3">ব্যবহারকারী ও ভূমিকা</th>
                  <th className="py-2.5 px-3">কার্যক্রমের ধরন</th>
                  <th className="py-2.5 px-3">রেকর্ড আইডি / রেজি: নং</th>
                  <th className="py-2.5 px-3">বিস্তারিত বিবরণ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono-tabular whitespace-nowrap">
                      <div className="font-bold text-slate-900">#{log.id}</div>
                      <div className="text-slate-500">
                        {new Date(log.createdAt).toLocaleString('bn-BD')}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">{log.actorNameBn}</div>
                      <div className="text-slate-500 text-[11px]">{log.actorRoleBn}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular font-semibold text-[#0f2942]">
                      {log.actionCode}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular">
                      {log.targetRegistrationNo ? (
                        <div>
                          <span className="font-bold">{log.targetRegistrationNo}</span>
                          <div className="text-[11px] text-slate-400">{log.targetRecordId}</div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{log.descriptionBn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: POSTGRESQL BACKUP, RECOVERY & ARCHITECTURE DOCUMENTATION (Module J & Step 1, 8, 9) */}
      {activeSubTab === 'BACKUP_ARCH' && (
        <div className="space-y-6">
          {/* Transparent PostgreSQL Runtime Notice (Rule 6 Compliance) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
            <div className="flex items-start gap-3">
              <Server className="w-6 h-6 text-[#0d6e6e] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-base font-bold text-[#0f2942]">
                  PostgreSQL ডাটাবেস সংযোগ ও পরিবেশের প্রকৃত অবস্থা (নিয়ম ৬ অনুযায়ী স্পষ্ট বিবৃতি)
                </h2>
                <p className="text-xs text-slate-700 leading-relaxed">
                  আপনার নির্দেশনা অনুযায়ী <strong>Firebase ব্যবহার করা হয়নি</strong>। বর্তমান Google AI Studio কন্টেইনারে বাহ্যিক ম্যানেজড Cloud SQL ইনস্ট্যান্স চালানোর জন্য বিলিং প্রজেক্ট সংযুক্ত না থাকায়, ব্যাকএন্ডে সরাসরি আসল <strong>PostgreSQL 16 ইঞ্জিন (<code>@electric-sql/pglite</code> + স্ট্যান্ডার্ড <code>pg.Pool</code> অ্যাডাপ্টার)</strong> সংযুক্ত করা হয়েছে। এর ফলে AI Studio প্রিভিউতে <code>./data/pgdata</code> ডিরেক্টরিতে ১০০% বাস্তব PostgreSQL টেবিল, ফরেন কি, ইনডেক্স ও ট্রানজ্যাকশন কাজ করছে এবং হাসপাতালের LAN বা প্রোডাকশন সার্ভারে <code>PG_HOST</code> এনভায়রনমেন্ট ভেরিয়েবল দিলে স্বয়ংক্রিয়ভাবে স্ট্যান্ডার্ড PostgreSQL সার্ভারে সংযুক্ত হবে।
                </p>
                <div className="text-xs font-mono-tabular text-teal-800 pt-1">
                  সক্রিয় ইঞ্জিন মোড: <strong>{dbMode}</strong> · মোট রিলেশনাল টেবিল: <strong>১১টি</strong>
                </div>
              </div>
            </div>
          </div>

          {/* PostgreSQL Backup & Restore Verification Panel (Module J) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#0f2942] flex items-center gap-2">
                  <Database className="w-5 h-5 text-[#0d6e6e]" />
                  <span>PostgreSQL ব্যাকআপ ও রিস্টোর অখণ্ডতা পরীক্ষা (Module J)</span>
                </h3>
                <p className="text-xs text-slate-600">
                  ডাটাবেস স্ন্যাপশট <code>./data/backups</code> ফোল্ডারে SHA-256 চেকসামসহ সংরক্ষিত হয় এবং যেকোনো সময় রিস্টোর ড্রাই-রান পরীক্ষা করা যায়।
                </p>
              </div>

              {currentUser.permissions.includes('BACKUP_MANAGE') && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={backupNotesBn}
                    onChange={(e) => setBackupNotesBn(e.target.value)}
                    placeholder="ব্যাকআপ নোট (ঐচ্ছিক)..."
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleCreateBackup}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0d6e6e] hover:bg-[#0a5858] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <HardDriveDownload className="w-4 h-4" />
                    <span>নতুন ব্যাকআপ নিন</span>
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-200">
                    <th className="py-2.5 px-3">ব্যাকআপ ফাইলের নাম ও সময়</th>
                    <th className="py-2.5 px-3">রেকর্ড ও সংযুক্তি সংখ্যা</th>
                    <th className="py-2.5 px-3">SHA-256 চেকসাম ও আকার</th>
                    <th className="py-2.5 px-3">রিস্টোর যাচাই ফলাফল</th>
                    <th className="py-2.5 px-3 text-right">কার্যক্রম</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {backups.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono-tabular">
                        <div className="font-bold text-slate-900">{b.backupFileName}</div>
                        <div className="text-slate-500">
                          {new Date(b.createdAt).toLocaleString('bn-BD')} · গ্রহণকারী:{' '}
                          {b.triggeredByNameBn}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        {toBengaliDigits(b.recordsCount)}টি রেকর্ড ·{' '}
                        {toBengaliDigits(b.attachmentsCount)}টি সংযুক্তি
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular">
                        <div>{(b.fileSizeBytes / 1024).toFixed(1)} KB</div>
                        <div className="text-[11px] text-slate-500">
                          SHA256: {String(b.checksumSha256).slice(0, 16)}...
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-emerald-700">{b.status}</div>
                        <div className="text-slate-600 text-[11px]">{b.verificationNotesBn}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleVerifyBackup(b.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-teal-300 bg-teal-50 text-teal-800 font-semibold cursor-pointer"
                          >
                            <FileCheck2 className="w-3.5 h-3.5" />
                            <span>রিস্টোর যাচাই</span>
                          </button>
                          <a
                            href={`/api/backups/${b.id}/download?token=${encodeURIComponent(authToken)}`}
                            download={b.backupFileName}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>ডাউনলোড</span>
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Step 1 & Step 9: Complete Architecture, Schema, Security & LAN/Internet Deployment Guide */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-[#0f2942] border-b border-slate-200 pb-2 flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#0d6e6e]" />
              <span>
                ধাপ ১ ও ৯: সম্পূর্ণ আর্কিটেকচার, PostgreSQL স্কিমা, নিরাপত্তা পরিকল্পনা ও হাসপাতালের LAN/Internet ডিপ্লয়মেন্ট নির্দেশনা
              </span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-700 leading-relaxed">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="font-bold text-[#0f2942] text-sm">
                  ১. ফোল্ডার কাঠামো ও ১১টি PostgreSQL টেবিল স্কিমা
                </h4>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <code>roles</code>, <code>permissions</code>, <code>role_permissions</code>, <code>users</code> — ৬টি ভূমিকা ও ১৮টি সার্ভার-সাইড পারমিশন।
                  </li>
                  <li>
                    <code>injury_registers</code> — স্থায়ী Internal ID (<code>id</code>), পৃথক ম্যানুয়াল <code>registration_no</code> ও ডুপ্লিকেট রোধক <code>normalized_reg_no</code>।
                  </li>
                  <li>
                    <code>legal_details</code> — থানা/কোর্ট মামলা, অতিরিক্ত রেজি:, স্বাক্ষর, এমসি প্রেরণের তারিখ ও সুপারিশকারী।
                  </li>
                  <li>
                    <code>attachments</code> — প্রাইভেট ফাইল স্টোরেজ, SHA-256 চেকসাম এবং সফট-ডিলিট ইতিহাস।
                  </li>
                  <li>
                    <code>review_history</code> ও <code>record_revisions</code> — প্রতিটি যাচাই/অনুমোদন ধাপ এবং পূর্বের তথ্যের পূর্ণ JSON স্ন্যাপশট।
                  </li>
                  <li>
                    <code>audit_logs</code> ও <code>backup_logs</code> — অপরিবর্তনীয় নিরাপত্তা অডিট ট্রেইল ও ব্যাকআপ লগ।
                  </li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="font-bold text-[#0f2942] text-sm">
                  ২. হাসপাতালের LAN ও ইন্টারনেট ডিপ্লয়মেন্ট এবং PostgreSQL রিস্টোর কমান্ড
                </h4>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <strong>LAN ও Production PostgreSQL সংযোগ:</strong> হাসপাতালের লোকাল সার্ভারে Ubuntu/Debian-এ PostgreSQL 16 ইনস্টল করে <code>.env</code> ফাইলে <code>PG_HOST=127.0.0.1</code>, <code>PG_DATABASE=hospital_injury_register</code>, <code>PG_USER</code> ও <code>PG_PASSWORD</code> সেট করুন।
                  </li>
                  <li>
                    <strong>নেটওয়ার্ক ও ফায়ারওয়াল (UFW + Nginx HTTPS):</strong> পোর্ট <code>5432</code> শুধুমাত্র লোকালহোস্টে সীমাবদ্ধ রাখুন (<code>ufw deny 5432</code>) এবং Nginx রিভার্স প্রক্সির মাধ্যমে TLS/HTTPS (পোর্ট <code>443</code>) চালু করুন।
                  </li>
                  <li>
                    <strong>ক্রন ব্যাকআপ ও রিস্টোর পরীক্ষা:</strong> দৈনিক রাত ১২টায় <code>pg_dump -Fc hospital_injury_register &gt; /var/backups/injury_$(date +%F).dump</code> এবং সংযুক্তি ফোল্ডার <code>rsync</code> করে অফ-সাইট স্টোরেজে সংরক্ষণ করুন।
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
