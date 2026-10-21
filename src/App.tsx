import React, { useState, useEffect, useCallback } from 'react';
import {
  Home,
  FileText,
  PlusCircle,
  BarChart3,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Shield,
  UserCheck,
  KeyRound,
  Download,
} from 'lucide-react';
import {
  InjuryRecord,
  UserSession,
  DashboardSummary,
  AttachmentItem,
} from './types';
import {
  toBengaliDigits,
  canDeleteInjuryRecord,
} from './utils/registerRules';
import { RegisterTableView } from './components/RegisterTableView';
import { RecordFormModal } from './components/RecordFormModal';
import { RecordDetailModal } from './components/RecordDetailModal';
import { ReportsAndPrintView } from './components/ReportsAndPrintView';
import { AdminAndSecurityPanels } from './components/AdminAndSecurityPanels';

type NavTab =
  | 'REGISTER'
  | 'DASHBOARD'
  | 'NEW_ENTRY'
  | 'REPORTS'
  | 'USERS'
  | 'AUDIT'
  | 'SETTINGS';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('REGISTER');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auth & Role Switcher State
  const [authToken, setAuthToken] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<any[]>([]);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Data State
  const [records, setRecords] = useState<InjuryRecord[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [loadingRecords, setLoadingRecords] = useState<boolean>(true);

  // Filter State for Register Table
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [completionFilter, setCompletionFilter] = useState('ALL');

  // Active Record Detail / Edit / Print / Attachment Preview
  const [selectedRecordDetail, setSelectedRecordDetail] = useState<InjuryRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<InjuryRecord | null>(null);
  const [singlePrintRecord, setSinglePrintRecord] = useState<InjuryRecord | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<AttachmentItem | null>(null);

  const fetchAuthMe = useCallback(async (tokenOverride?: string) => {
    const t = tokenOverride ?? authToken;
    const headers: Record<string, string> = {};
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch('/api/auth/me', { headers });
    if (res.ok) {
      const data = await res.json();
      setCurrentUser(data.user);
      if (data.token && !t) {
        setAuthToken(data.token);
      }
      setAvailableAccounts(data.availableAccounts || []);
      return data.token || t;
    }
    return t;
  }, [authToken]);

  const fetchDashboardAndRecords = useCallback(
    async (
      activeToken: string,
      filters?: {
        search?: string;
        fromDate?: string;
        toDate?: string;
        completionStatus?: string;
      }
    ) => {
      setLoadingRecords(true);
      try {
        const headers: Record<string, string> = {};
        if (activeToken) headers.Authorization = `Bearer ${activeToken}`;

        const q = new URLSearchParams();
        const s = filters?.search ?? searchQuery;
        const fd = filters?.fromDate ?? fromDate;
        const td = filters?.toDate ?? toDate;
        const cs = filters?.completionStatus ?? completionFilter;

        if (s.trim()) q.set('search', s.trim());
        if (fd) q.set('fromDate', fd);
        if (td) q.set('toDate', td);
        if (cs && cs !== 'ALL') q.set('completionStatus', cs);

        const [recRes, dashRes] = await Promise.all([
          fetch(`/api/records?${q.toString()}`, { headers }),
          fetch('/api/dashboard/summary', { headers }),
        ]);

        if (recRes.ok) {
          const recData = await recRes.json();
          setRecords(recData.records || []);
        }
        if (dashRes.ok) {
          const dashData = await dashRes.json();
          setDashboardSummary(dashData);
        }
      } finally {
        setLoadingRecords(false);
      }
    },
    [searchQuery, fromDate, toDate, completionFilter]
  );

  useEffect(() => {
    (async () => {
      const resolvedToken = await fetchAuthMe();
      await fetchDashboardAndRecords(resolvedToken);
    })();
  }, []);

  // Re-fetch when filters change
  useEffect(() => {
    if (!currentUser) return;
    fetchDashboardAndRecords(authToken);
  }, [completionFilter, fromDate, toDate]);

  const handleOpenRecordDetail = async (recordId: string) => {
    const res = await fetch(`/api/records/${recordId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      setSelectedRecordDetail(data.record);
    }
  };

  const handleDeleteRecord = async (
    recordId: string,
    reasonBn: string
  ): Promise<{ ok: boolean; messageBn: string }> => {
    try {
      const res = await fetch(`/api/records/${recordId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ reasonBn }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          ok: false,
          messageBn: data.error || 'জখমী রেকর্ড ডিলিট করা যায়নি।',
        };
      }
      if (selectedRecordDetail?.id === recordId) {
        setSelectedRecordDetail(null);
      }
      if (editingRecord?.id === recordId) {
        setEditingRecord(null);
      }
      await fetchDashboardAndRecords(authToken);
      return {
        ok: true,
        messageBn: data.messageBn || 'জখমী রেকর্ডটি সফলভাবে ডিলিট করা হয়েছে।',
      };
    } catch {
      return {
        ok: false,
        messageBn: 'সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি।',
      };
    }
  };

  const handleSwitchUserAccount = async (userId: string) => {
    const res = await fetch('/api/auth/switch-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const data = await res.json();
      setAuthToken(data.token);
      setCurrentUser(data.user);
      setLoginModalOpen(false);
      await fetchDashboardAndRecords(data.token);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginUsername, password: loginPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLoginError(data.error || 'লগইন ব্যর্থ হয়েছে।');
      return;
    }
    setAuthToken(data.token);
    setCurrentUser(data.user);
    setLoginUsername('');
    setLoginPassword('');
    setLoginModalOpen(false);
    await fetchDashboardAndRecords(data.token);
  };

  const navItems: Array<{
    id: NavTab;
    labelBn: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'DASHBOARD', labelBn: 'ড্যাশবোর্ড', icon: Home },
    { id: 'REGISTER', labelBn: 'জখমী রেজিস্টার', icon: FileText },
    { id: 'NEW_ENTRY', labelBn: 'নতুন এন্ট্রি', icon: PlusCircle },
    { id: 'REPORTS', labelBn: 'রিপোর্ট', icon: BarChart3 },
    { id: 'USERS', labelBn: 'ব্যবহারকারী ব্যবস্থাপনা', icon: Users },
    { id: 'AUDIT', labelBn: 'অডিট লগ', icon: Shield },
    { id: 'SETTINGS', labelBn: 'সেটিংস ও ব্যাকআপ', icon: Settings },
  ];

  const handleNavClick = (tab: NavTab) => {
    setSelectedRecordDetail(null);
    setEditingRecord(null);
    if (tab !== 'REPORTS') {
      setSinglePrintRecord(null);
    }
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const incompleteRecordsList = records.filter(
    (r) => r.completionStatus === 'INCOMPLETE'
  );

  return (
    <div className="min-h-screen flex bg-[#f1f5f9] text-slate-900">
      {/* LEFT SIDEBAR (Desktop persistent, Mobile slide-over) — Matching Hospital Mockup */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 w-64 bg-[#0f2942] text-white flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 shrink-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Emblem Area */}
        <div className="p-5 flex items-center justify-between lg:justify-center border-b border-white/10">
          <div className="flex items-center gap-3">
            {/* Bangladesh Govt / Hospital Emblem SVG */}
            <div className="w-12 h-12 rounded-full bg-white p-1 flex items-center justify-center shadow-sm shrink-0">
              <div className="w-full h-full rounded-full border-2 border-emerald-700 bg-rose-600 flex items-center justify-center text-amber-300 font-bold text-[10px] text-center leading-none">
                বাংলাদেশ
                <br />
                সরকার
              </div>
            </div>
            <div className="lg:hidden">
              <div className="text-xs font-bold leading-tight">জখমী রেজিস্টার</div>
              <div className="text-[11px] text-slate-300">কিশোরগঞ্জ</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="মেনু বন্ধ করুন"
            className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto" aria-label="প্রধান নেভিগেশন">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeTab === item.id && !selectedRecordDetail && !editingRecord;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#0d8a72] text-white shadow-xs'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.labelBn}</span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Active Role Info in Sidebar Footer */}
        {currentUser && (
          <div className="p-4 border-t border-white/10 bg-[#0b1f33] text-xs space-y-1.5">
            <div className="text-slate-400">সক্রিয় ভূমিকা (RBAC):</div>
            <div className="font-bold text-teal-300">{currentUser.roleNameBn}</div>
            <button
              type="button"
              onClick={() => setLoginModalOpen(true)}
              className="w-full mt-1 py-1.5 px-2.5 rounded bg-white/10 hover:bg-white/20 text-white font-medium text-center transition-colors cursor-pointer"
            >
              ভূমিকা / ইউজার পরিবর্তন করুন
            </button>
          </div>
        )}
      </aside>

      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="no-print fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}

      {/* MAIN WORKSPACE COLUMN */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP HEADER BAR — Matching Hospital Mockup */}
        <header className="no-print bg-white border-b border-slate-200 px-4 lg:px-6 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="নেভিগেশন মেনু খুলুন"
              className="lg:hidden p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <div className="text-base sm:text-xl font-bold text-[#0f2942] truncate">
                শহীদ সৈয়দ নজরুল ইসলাম মেডিকেল কলেজ হাসপাতাল, কিশোরগঞ্জ
              </div>
              <div className="text-xs sm:text-sm text-slate-600 truncate">
                জখমী রেজিস্টার ব্যবস্থাপনা সিস্টেম
              </div>
            </div>
          </div>

          {/* Right User Profile & Logout / Role Switch Controls */}
          <div className="flex items-center gap-3 sm:gap-5 shrink-0">
            {currentUser && (
              <button
                type="button"
                onClick={() => setLoginModalOpen(true)}
                title="ব্যবহারকারী পরিবর্তন বা লগইন করুন"
                className="flex items-center gap-2.5 text-left hover:bg-slate-50 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-[#0f2942] text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {currentUser.fullNameBn.slice(0, 1)}
                </div>
                <div className="hidden sm:block">
                  <div className="text-xs font-bold text-slate-900 leading-tight">
                    {currentUser.fullNameBn}
                  </div>
                  <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                    {currentUser.designationBn}
                  </div>
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={() => setLoginModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50/60 hover:bg-rose-100 text-rose-700 text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-4 h-4" />
              <span>লগআউট</span>
            </button>
          </div>
        </header>

        {/* MAIN VIEWPORT CONTENT */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1640px] w-full mx-auto space-y-5">
          {/* Modal-style Inline Views for Record Detail or Record Edit */}
          {selectedRecordDetail && currentUser ? (
            <RecordDetailModal
              record={selectedRecordDetail}
              currentUser={currentUser}
              authToken={authToken}
              onClose={() => setSelectedRecordDetail(null)}
              onEdit={(rec) => {
                setSelectedRecordDetail(null);
                setEditingRecord(rec);
              }}
              onPrintSingle={(rec) => {
                setSelectedRecordDetail(null);
                setSinglePrintRecord(rec);
                setActiveTab('REPORTS');
              }}
              onDeleteRecord={handleDeleteRecord}
              canDeleteRecord={
                canDeleteInjuryRecord(
                  currentUser.roleCode,
                  currentUser.permissions as any
                ).allowed
              }
              onRecordUpdated={(updated) => {
                setSelectedRecordDetail(updated);
                fetchDashboardAndRecords(authToken);
              }}
              onOpenAttachment={(att) => setPreviewAttachment(att)}
            />
          ) : editingRecord ? (
            <RecordFormModal
              initialRecord={editingRecord}
              authToken={authToken}
              onClose={() => setEditingRecord(null)}
              onSaved={(saved) => {
                setEditingRecord(null);
                setSelectedRecordDetail(saved);
                fetchDashboardAndRecords(authToken);
              }}
            />
          ) : activeTab === 'NEW_ENTRY' ? (
            <RecordFormModal
              initialRecord={null}
              authToken={authToken}
              onClose={() => setActiveTab('REGISTER')}
              onSaved={(saved) => {
                setActiveTab('REGISTER');
                setSelectedRecordDetail(saved);
                fetchDashboardAndRecords(authToken);
              }}
            />
          ) : activeTab === 'DASHBOARD' ? (
            /* MODULE A: DASHBOARD */
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-[#0f2942]">
                    ড্যাশবোর্ড ও সার্বিক পরিস্থিতি (Module A)
                  </h1>
                  <p className="text-xs text-slate-600 mt-0.5">
                    হাসপাতালের জখমী রেজিস্টারের তাৎক্ষণিক পরিসংখ্যান, সম্পূর্ণ/অসম্পূর্ণ অবস্থা এবং সাম্প্রতিক কার্যক্রম
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab('REGISTER')}
                    className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    ১৩ কলামের রেজিস্টার দেখুন
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('NEW_ENTRY')}
                    className="px-4 py-2 rounded-lg bg-[#0d6e6e] hover:bg-[#0a5858] text-white text-xs font-semibold cursor-pointer"
                  >
                    + নতুন জখমী এন্ট্রি
                  </button>
                </div>
              </div>

              {/* 4 Focused Dashboard KPI Cards (Without Verification/Approval) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    label: 'মোট রেকর্ড',
                    value: dashboardSummary?.totalRecords ?? records.length,
                    sub: 'সকল নিবন্ধিত জখমী',
                    color: 'text-[#0f2942]',
                    filterAction: () => {
                      setCompletionFilter('ALL');
                      setActiveTab('REGISTER');
                    },
                  },
                  {
                    label: 'আজকের নতুন রেকর্ড',
                    value: dashboardSummary?.todayNewRecords ?? 0,
                    sub: 'আজকের তারিখে এন্ট্রি',
                    color: 'text-teal-700',
                    filterAction: () => {
                      const today = new Date().toISOString().slice(0, 10);
                      setFromDate(today);
                      setToDate(today);
                      setActiveTab('REGISTER');
                    },
                  },
                  {
                    label: 'সম্পূর্ণ রেকর্ড',
                    value: dashboardSummary?.completeRecords ?? 0,
                    sub: 'সকল তথ্য ও প্রতিবেদন পূর্ণাঙ্গ',
                    color: 'text-emerald-700',
                    filterAction: () => {
                      setCompletionFilter('COMPLETE');
                      setActiveTab('REGISTER');
                    },
                  },
                  {
                    label: 'অসম্পূর্ণ রেকর্ড',
                    value: dashboardSummary?.incompleteRecords ?? 0,
                    sub: 'রিপোর্ট/এমসি বাকি',
                    color: 'text-rose-700',
                    filterAction: () => {
                      setCompletionFilter('INCOMPLETE');
                      setActiveTab('REGISTER');
                    },
                  },
                ].map((stat, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={stat.filterAction}
                    className="bg-white border border-slate-200 hover:border-[#0d6e6e] rounded-xl p-4 text-left transition-colors shadow-xs cursor-pointer"
                  >
                    <div className="text-xs font-bold text-slate-600">{stat.label}</div>
                    <div className={`text-2xl font-bold mt-1.5 font-mono-tabular ${stat.color}`}>
                      {toBengaliDigits(stat.value)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">{stat.sub}</div>
                  </button>
                ))}
              </div>

              {/* Recent Activities & Incomplete Records Follow-up Split */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <h2 className="text-sm font-bold text-[#0f2942]">
                      সাম্প্রতিক কার্যক্রম (Recent Audit Activities)
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('AUDIT')}
                      className="text-xs text-[#0d6e6e] hover:underline font-semibold cursor-pointer"
                    >
                      সকল লগ দেখুন →
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 text-xs">
                    {(dashboardSummary?.recentActivities || []).map((act) => (
                      <div key={act.id} className="py-2.5 flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">
                            {act.descriptionBn}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {act.actorNameBn} · {act.actorRoleBn}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono-tabular shrink-0">
                          {new Date(act.createdAt).toLocaleTimeString('bn-BD', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <h2 className="text-sm font-bold text-[#0f2942]">
                      অসম্পূর্ণ রেকর্ডসমূহ (পরীক্ষার রিপোর্ট / এমসি প্রেরণ বাকি)
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setCompletionFilter('INCOMPLETE');
                        setActiveTab('REGISTER');
                      }}
                      className="text-xs text-[#0d6e6e] hover:underline font-semibold cursor-pointer"
                    >
                      রেজিস্টারে ফিল্টার করুন →
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 text-xs">
                    {incompleteRecordsList.map((rec) => (
                      <div
                        key={rec.id}
                        className="py-2.5 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="font-bold text-slate-900 font-mono-tabular">
                            রেজি: {rec.registrationNo} — {rec.injuredName} ({rec.injuredAge})
                          </div>
                          <div className="text-slate-500 mt-0.5">
                            থানা: {rec.policeStationName || '—'} · প্রয়োজনীয় পরীক্ষা:{' '}
                            {rec.requiredTestReports || '—'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenRecordDetail(rec.id)}
                          className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-[#0f2942] font-semibold cursor-pointer whitespace-nowrap"
                        >
                          বিস্তারিত দেখুন
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'REPORTS' ? (
            /* MODULE G: REPORTS & PRINT */
            <ReportsAndPrintView
              records={records}
              singlePrintRecord={singlePrintRecord}
              onClearSinglePrint={() => setSinglePrintRecord(null)}
            />
          ) : activeTab === 'USERS' && currentUser ? (
            <AdminAndSecurityPanels
              activeSubTab="USERS"
              currentUser={currentUser}
              authToken={authToken}
              onUsersChanged={() => fetchAuthMe(authToken)}
            />
          ) : activeTab === 'AUDIT' && currentUser ? (
            <AdminAndSecurityPanels
              activeSubTab="AUDIT"
              currentUser={currentUser}
              authToken={authToken}
            />
          ) : activeTab === 'SETTINGS' && currentUser ? (
            <AdminAndSecurityPanels
              activeSubTab="BACKUP_ARCH"
              currentUser={currentUser}
              authToken={authToken}
            />
          ) : (
            /* DEFAULT MAIN VIEW: 13-COLUMN INJURY REGISTER (Matching Uploaded Hospital Mockup) */
            <RegisterTableView
              records={records}
              loading={loadingRecords}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              fromDate={fromDate}
              setFromDate={setFromDate}
              toDate={toDate}
              setToDate={setToDate}
              completionFilter={completionFilter}
              setCompletionFilter={setCompletionFilter}
              onSearchSubmit={() => fetchDashboardAndRecords(authToken)}
              onResetFilters={() => {
                setSearchQuery('');
                setFromDate('');
                setToDate('');
                setCompletionFilter('ALL');
                fetchDashboardAndRecords(authToken, {
                  search: '',
                  fromDate: '',
                  toDate: '',
                  completionStatus: 'ALL',
                });
              }}
              onOpenNewEntry={() => setActiveTab('NEW_ENTRY')}
              onSelectRecordDetail={(id) => handleOpenRecordDetail(id)}
              onEditRecord={(rec) => setEditingRecord(rec)}
              onPrintSingleRecord={(rec) => {
                setSinglePrintRecord(rec);
                setActiveTab('REPORTS');
              }}
              onDeleteRecord={handleDeleteRecord}
              onOpenAttachment={(att) => setPreviewAttachment(att)}
              canCreateRecord={Boolean(
                currentUser?.permissions.includes('RECORD_CREATE')
              )}
              canDeleteRecord={Boolean(
                currentUser &&
                  canDeleteInjuryRecord(
                    currentUser.roleCode,
                    currentUser.permissions as any
                  ).allowed
              )}
            />
          )}
        </main>
      </div>

      {/* PROTECTED ATTACHMENT PREVIEW MODAL (Module H) */}
      {previewAttachment && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="সংরক্ষিত সংযুক্তি নথি প্রিভিউ"
          className="no-print fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl max-w-3xl w-full overflow-hidden shadow-xl border border-slate-200">
            <div className="px-5 py-3.5 bg-[#0f2942] text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">{previewAttachment.originalName}</h3>
                <p className="text-[11px] text-slate-300 font-mono-tabular">
                  SHA-256: {previewAttachment.checksumSha256.slice(0, 24)}... · আপলোডকারী:{' '}
                  {previewAttachment.uploadedByNameBn}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/attachments/${previewAttachment.id}/download?token=${encodeURIComponent(
                    authToken
                  )}`}
                  download={previewAttachment.originalName}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0d6e6e] hover:bg-[#0a5858] text-white text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>ডাউনলোড</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  aria-label="প্রিভিউ বন্ধ করুন"
                  className="p-1 rounded hover:bg-white/10 text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[75vh] overflow-auto">
              {previewAttachment.mimeType.startsWith('image/') ? (
                <img
                  src={`/api/attachments/${previewAttachment.id}/download?token=${encodeURIComponent(
                    authToken
                  )}`}
                  alt={previewAttachment.originalName}
                  referrerPolicy="no-referrer"
                  className="max-w-full h-auto rounded border border-slate-300 bg-white shadow-xs"
                />
              ) : (
                <iframe
                  title={previewAttachment.originalName}
                  src={`/api/attachments/${previewAttachment.id}/download?token=${encodeURIComponent(
                    authToken
                  )}`}
                  className="w-full h-[65vh] rounded border border-slate-300 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* LOGIN & RBAC ROLE SWITCHER MODAL (Module F) */}
      {loginModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="লগইন ও ভূমিকা নির্বাচন"
          className="no-print fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl max-w-2xl w-full overflow-hidden shadow-xl border border-slate-200">
            <div className="px-6 py-4 bg-[#0f2942] text-white flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold">
                  লগইন ও ভূমিকাভিত্তিক সেশন নির্বাচন (RBAC Authentication)
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  পাসওয়ার্ড দিয়ে লগইন করুন অথবা হাসপাতালের অনুমোদিত ভূমিকার (Role) যেকোনো একটিতে প্রবেশ করে অনুমতি পরীক্ষা করুন
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLoginModalOpen(false)}
                aria-label="লগইন মডাল বন্ধ করুন"
                className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Standard Username & Password Login */}
              <form onSubmit={handlePasswordLogin} className="space-y-3">
                <h3 className="text-xs font-bold text-[#0f2942] flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <KeyRound className="w-4 h-4 text-[#0d6e6e]" />
                  <span>ইউজারনেম ও পাসওয়ার্ড লগইন</span>
                </h3>
                {loginError && (
                  <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                    {loginError}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ইউজারনেম
                  </label>
                  <input
                    type="text"
                    required
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="zakaria.admin / kamrul.operator"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    পাসওয়ার্ড (ডিফল্ট: Hospital@2026)
                  </label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Hospital@2026"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 px-4 rounded-lg bg-[#0f2942] hover:bg-[#163a5f] text-white text-xs font-semibold cursor-pointer"
                >
                  পাসওয়ার্ড যাচাই করে লগইন করুন
                </button>
              </form>

              {/* Quick Hospital Role Switcher */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold text-[#0f2942] flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <UserCheck className="w-4 h-4 text-[#0d6e6e]" />
                  <span>দ্রুত ভূমিকা পরীক্ষা (হাসপাতাল প্রোফাইলসমূহ)</span>
                </h3>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {availableAccounts.map((acc) => {
                    const isCurrent = currentUser?.id === acc.id;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => handleSwitchUserAccount(acc.id)}
                        className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                          isCurrent
                            ? 'border-[#0d6e6e] bg-teal-50/70'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-slate-900">
                          <span>{acc.fullNameBn}</span>
                          {isCurrent && (
                            <span className="text-[11px] text-teal-800">সক্রিয়</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600">{acc.designationBn}</div>
                        <div className="text-[10px] text-slate-500 font-mono-tabular mt-0.5">
                          ইউজার: {acc.username} · {acc.roleNameBn}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

