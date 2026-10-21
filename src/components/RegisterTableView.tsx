import React, { useState } from 'react';
import {
  Search,
  RotateCcw,
  Plus,
  Paperclip,
  Eye,
  Edit3,
  Printer,
  Trash2,
  AlertTriangle,
  User,
  Stethoscope,
  Calendar,
  FileText,
  Clock,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { InjuryRecord, AttachmentItem } from '../types';
import {
  formatDisplayDate,
  toBengaliDigits,
} from '../utils/registerRules';

interface RegisterTableViewProps {
  records: InjuryRecord[];
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
  completionFilter: string;
  setCompletionFilter: (v: string) => void;
  onSearchSubmit: () => void;
  onResetFilters: () => void;
  onOpenNewEntry: () => void;
  onSelectRecordDetail: (recordId: string) => void;
  onEditRecord: (record: InjuryRecord) => void;
  onPrintSingleRecord: (record: InjuryRecord) => void;
  onDeleteRecord: (recordId: string, reasonBn: string) => Promise<{ ok: boolean; messageBn: string }>;
  onOpenAttachment: (attachment: AttachmentItem) => void;
  canCreateRecord: boolean;
  canDeleteRecord: boolean;
}

export const RegisterTableView: React.FC<RegisterTableViewProps> = ({
  records,
  loading,
  searchQuery,
  setSearchQuery,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  completionFilter,
  setCompletionFilter,
  onSearchSubmit,
  onResetFilters,
  onOpenNewEntry,
  onSelectRecordDetail,
  onEditRecord,
  onPrintSingleRecord,
  onDeleteRecord,
  onOpenAttachment,
  canCreateRecord,
  canDeleteRecord,
}) => {
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [showMobileAdvancedFilters, setShowMobileAdvancedFilters] = useState<boolean>(false);
  const [pendingDeleteRecord, setPendingDeleteRecord] = useState<InjuryRecord | null>(null);
  const [deleteReasonBn, setDeleteReasonBn] = useState<string>('');
  const [deleting, setDeleting] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleConfirmDelete = async () => {
    if (!pendingDeleteRecord) return;
    setDeleting(true);
    setStatusBanner(null);
    try {
      const res = await onDeleteRecord(pendingDeleteRecord.id, deleteReasonBn.trim());
      if (res.ok) {
        setStatusBanner({ type: 'success', text: res.messageBn });
        setPendingDeleteRecord(null);
        setDeleteReasonBn('');
      } else {
        setStatusBanner({ type: 'error', text: res.messageBn });
      }
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRecords = records.slice((safePage - 1) * pageSize, safePage * pageSize);

  const getAttachmentsByCategory = (
    record: InjuryRecord,
    category: 'APPLICATION' | 'OTHER_INFO' | 'ENTRY_BOOK'
  ) => {
    return (record.attachments || []).filter((a) => a.category === category);
  };

  return (
    <div className="space-y-3.5">
      {/* Page Title & Primary CTA Banner (Matching Hospital Mockup) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3.5 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-[#0d6e6e] text-white flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#0f2942] tracking-tight">
                জখমী রেজিস্টার
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                জখমীর তথ্য সংরক্ষণ ও ব্যবস্থাপনা (সরকারি ১৩ কলামের মূল রেজিস্টার)
              </p>
            </div>
          </div>

          {canCreateRecord && (
            <button
              type="button"
              onClick={onOpenNewEntry}
              className="hidden sm:inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#0d6e6e] hover:bg-[#0a5858] text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>নতুন জখমী এন্ট্রি করুন</span>
            </button>
          )}
        </div>

        {/* Mobile Search + Primary Button (Matching Right Phone Mockup) */}
        <div className="sm:hidden pt-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="মোবাইল অনুসন্ধান"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="রেজি: নং, নাম, মামলা নং দিয়ে খুঁজুন"
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d6e6e]"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowMobileAdvancedFilters((v) => !v)}
              aria-label="তারিখ ও অবস্থা ফিল্টার"
              className="p-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>

          {canCreateRecord && (
            <button
              type="button"
              onClick={onOpenNewEntry}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#0d6e6e] hover:bg-[#0a5858] text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>নতুন জখমী এন্ট্রি করুন</span>
            </button>
          )}
        </div>

        {/* Desktop Search & Filter Controls Row (Also toggleable on Mobile) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setCurrentPage(1);
            onSearchSubmit();
          }}
          className={`${
            showMobileAdvancedFilters ? 'grid' : 'hidden sm:grid'
          } pt-3.5 grid-cols-1 md:grid-cols-12 gap-3 items-end`}
        >
          <div className="hidden sm:block md:col-span-4">
            <label
              htmlFor="register-search-input"
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              অনুসন্ধান
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="register-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="রেজি: নং, নাম, মামলা নং ইত্যাদি দিয়ে খুঁজুন"
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d6e6e]"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="filter-from-date"
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              তারিখ (থেকে)
            </label>
            <input
              id="filter-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d6e6e]"
            />
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="filter-to-date"
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              তারিখ (পর্যন্ত)
            </label>
            <input
              id="filter-to-date"
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d6e6e]"
            />
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="filter-completion"
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              সম্পূর্ণ / অসম্পূর্ণ অবস্থা
            </label>
            <select
              id="filter-completion"
              value={completionFilter}
              onChange={(e) => {
                setCompletionFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0d6e6e]"
            >
              <option value="ALL">সকল রেকর্ড ({toBengaliDigits(records.length)})</option>
              <option value="COMPLETE">সম্পূর্ণ রেকর্ড</option>
              <option value="INCOMPLETE">অসম্পূর্ণ রেকর্ড</option>
            </select>
          </div>

          <div className="md:col-span-2 flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0f2942] hover:bg-[#163a5f] text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Search className="w-4 h-4" />
              <span>খুঁজুন</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentPage(1);
                onResetFilters();
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              <span>রিসেট</span>
            </button>
          </div>
        </form>
      </div>

      {statusBanner && (
        <div
          role="status"
          className={`p-3.5 rounded-xl border text-xs sm:text-sm font-medium flex items-center justify-between gap-3 ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{statusBanner.text}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-xs underline cursor-pointer"
          >
            বন্ধ করুন
          </button>
        </div>
      )}

      {pendingDeleteRecord && (
        <div
          role="dialog"
          aria-label="জখমী রেকর্ড ডিলিট নিশ্চিতকরণ"
          className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 sm:p-5 shadow-xs space-y-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <h3 className="text-sm font-bold text-rose-950">
                জখমী রেকর্ড ডিলিট নিশ্চিতকরণ — রেজি: নং {pendingDeleteRecord.registrationNo} ({pendingDeleteRecord.injuredName})
              </h3>
              <p className="text-xs text-rose-800">
                আপনি কি নিশ্চিতভাবে এই জখমী রেকর্ডটি রেজিস্টার থেকে ডিলিট করতে চান? ডিলিট করার তথ্য অডিট লগে সংরক্ষিত থাকবে।
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
            <input
              type="text"
              value={deleteReasonBn}
              onChange={(e) => setDeleteReasonBn(e.target.value)}
              placeholder="ডিলিট করার কারণ লিখুন (ঐচ্ছিক, যেমন: ভুলবশত ডুপ্লিকেট এন্ট্রি)..."
              className="flex-1 px-3 py-2 text-xs sm:text-sm bg-white border border-rose-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setPendingDeleteRecord(null);
                  setDeleteReasonBn('');
                }}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? 'ডিলিট হচ্ছে...' : 'নিশ্চিত ডিলিট করুন'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP 13-COLUMN OFFICIAL REGISTER TABLE (All 13 columns fit inside 1440px desktop viewport) */}
      <div className="hidden lg:block bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto register-scroll">
          <table className="w-full border-collapse text-left min-w-[1110px]">
            <thead>
              <tr className="bg-[#eef3f8] text-[#0f2942] border-b border-slate-300 text-[11px] font-bold leading-tight">
                <th className="py-2.5 px-2 border-r border-slate-200 w-[78px]">
                  <div>রেজি: নং</div>
                  <div>ও তারিখ</div>
                </th>
                <th className="py-2.5 px-2 border-r border-slate-200 w-[135px]">
                  <div>জখমীর নাম, বয়স,</div>
                  <div>পিতার নাম ও ঠিকানা</div>
                </th>
                <th className="py-2.5 px-2 border-r border-slate-200 w-[98px]">
                  <div>চিকিৎসকের নাম/</div>
                  <div>এন্ট্রি পাচ্ছি না</div>
                </th>
                <th className="py-2.5 px-2 border-r border-slate-200 w-[76px]">
                  <div>অতিরিক্ত</div>
                  <div>রেজি: নং</div>
                  <div>ও তারিখ</div>
                </th>
                <th className="py-2.5 px-2 border-r border-slate-200 w-[86px]">
                  <div>অত্র প্রতিষ্ঠানের</div>
                  <div>স্মারক নম্বর</div>
                  <div>ও তারিখ</div>
                </th>
                <th className="py-2.5 px-2 border-r border-slate-200 w-[124px]">
                  <div>থানার মামলা নম্বর</div>
                  <div>ও তারিখ/ কোর্টের</div>
                  <div>মামলা নম্বর ও তারিখ</div>
                </th>
                <th className="py-2.5 px-1.5 border-r border-slate-200 w-[72px] text-center">
                  <div>এমসি</div>
                  <div>প্রেরণের</div>
                  <div>তারিখ</div>
                </th>
                <th className="py-2.5 px-2 border-r border-slate-200 w-[86px]">
                  <div>কি কি পরীক্ষা</div>
                  <div>রিপোর্ট লাগবে</div>
                </th>
                <th className="py-2.5 px-2 border-r border-slate-200 w-[82px]">
                  <div>সুপারিশকারী</div>
                  <div>যদি থাকে</div>
                </th>
                <th className="py-2.5 px-1.5 border-r border-slate-200 w-[92px] text-center">
                  <div>আবেদনপত্র</div>
                  <div>সংযুক্তি/ অন্যান্য</div>
                  <div>তথ্য সংযুক্তি</div>
                </th>
                <th className="py-2.5 px-1.5 border-r border-slate-200 w-[82px] text-center">
                  <div>এন্ট্রির খাতা</div>
                  <div>সংযুক্তি</div>
                </th>
                <th className="py-2.5 px-2 border-r border-slate-200 w-[72px]">
                  <div>মন্তব্য</div>
                </th>
                <th className="py-2.5 px-1.5 w-[86px] text-center">
                  <div>সম্পূর্ণ/</div>
                  <div>অসম্পূর্ণ</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-[11px] text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-500 text-sm">
                    জখমী রেজিস্টারের তথ্য লোড হচ্ছে...
                  </td>
                </tr>
              ) : paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-500 text-sm">
                    কোনো জখমী রেকর্ড পাওয়া যায়নি। নতুন রেকর্ড যোগ করতে উপরের &ldquo;নতুন জখমী এন্ট্রি করুন&rdquo; বাটনে ক্লিক করুন।
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((rec) => {
                  const appAttachments = getAttachmentsByCategory(rec, 'APPLICATION');
                  const otherAttachments = getAttachmentsByCategory(rec, 'OTHER_INFO');
                  const bookAttachments = getAttachmentsByCategory(rec, 'ENTRY_BOOK');

                  return (
                    <tr
                      key={rec.id}
                      className="hover:bg-slate-50/90 transition-colors align-top"
                    >
                      {/* কলাম ১: রেজি: নং ও তারিখ */}
                      <td className="py-2.5 px-2 border-r border-slate-200 font-mono-tabular">
                        <div className="font-bold text-slate-900">
                          {rec.registrationNo}
                        </div>
                        <div className="text-slate-600 mt-0.5">
                          {formatDisplayDate(rec.registrationDate, false)}
                        </div>
                      </td>

                      {/* কলাম ২: জখমীর নাম, বয়স, পিতার ও ঠিকানা */}
                      <td className="py-2.5 px-2 border-r border-slate-200 leading-snug">
                        <div className="font-bold text-slate-900 text-xs">
                          {rec.injuredName} ({rec.injuredAge})
                        </div>
                        <div className="text-slate-700 mt-0.5">
                          পিতা: {rec.fatherOrGuardianName || '—'}
                        </div>
                        <div className="text-slate-600">{rec.injuredAddress || '—'}</div>
                      </td>

                      {/* কলাম ৩: চিকিৎসকের নাম/এন্ট্রি পাচ্ছি না */}
                      <td className="py-2.5 px-2 border-r border-slate-200 leading-snug">
                        {rec.doctorEntryNotFound ? (
                          <span className="text-amber-800 font-semibold">
                            এন্ট্রি পাচ্ছি না
                          </span>
                        ) : (
                          <div className="font-medium text-slate-900">
                            {rec.doctorName || '—'}
                          </div>
                        )}
                      </td>

                      {/* কলাম ৪: অতিরিক্ত রেজি: নং ও তারিখ */}
                      <td className="py-2.5 px-2 border-r border-slate-200 font-mono-tabular">
                        <div className="font-medium text-slate-900">
                          {rec.additionalRegNo || '—'}
                        </div>
                        {rec.additionalRegDate && (
                          <div className="text-slate-600 mt-0.5">
                            {formatDisplayDate(rec.additionalRegDate, false)}
                          </div>
                        )}
                      </td>

                      {/* কলাম ৫: অত্র প্রতিষ্ঠানের স্মারক নম্বর ও তারিখ */}
                      <td className="py-2.5 px-2 border-r border-slate-200 font-mono-tabular">
                        <div className="font-medium text-slate-900">
                          {rec.signatureNo || '—'}
                        </div>
                        {rec.signatureDate && (
                          <div className="text-slate-600 mt-0.5">
                            {formatDisplayDate(rec.signatureDate, false)}
                          </div>
                        )}
                      </td>

                      {/* কলাম ৬: থানার মামলা নম্বর ও তারিখ/কোর্টের মামলা নম্বর ও তারিখ */}
                      <td className="py-2.5 px-2 border-r border-slate-200 leading-snug">
                        {rec.policeStationName && (
                          <div className="font-semibold text-slate-900">
                            {rec.policeStationName}
                          </div>
                        )}
                        {rec.policeCaseNo && (
                          <div className="text-slate-700">
                            মামলা নং: {rec.policeCaseNo}
                          </div>
                        )}
                        {rec.policeCaseDate && (
                          <div className="text-slate-600">
                            তারিখ: {formatDisplayDate(rec.policeCaseDate, true)}
                          </div>
                        )}
                        {rec.courtCaseNo && (
                          <div className="text-slate-700 mt-0.5">
                            কোর্ট: {rec.courtCaseNo}
                          </div>
                        )}
                        {!rec.policeStationName && !rec.policeCaseNo && !rec.courtCaseNo && (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* কলাম ৭: এমসি প্রেরণের তারিখ */}
                      <td className="py-2.5 px-1.5 border-r border-slate-200 text-center font-mono-tabular">
                        {rec.mcDispatchDate
                          ? formatDisplayDate(rec.mcDispatchDate, true)
                          : '—'}
                      </td>

                      {/* কলাম ৮: কি কি পরীক্ষা রিপোর্ট লাগবে */}
                      <td className="py-2.5 px-2 border-r border-slate-200 leading-snug">
                        {rec.requiredTestReports || '—'}
                      </td>

                      {/* কলাম ৯: সুপারিশকারী যদি থাকে */}
                      <td className="py-2.5 px-2 border-r border-slate-200 leading-snug">
                        {rec.recommenderInfo || '—'}
                      </td>

                      {/* কলাম ১০: আবেদনপত্র সংযুক্তি/অন্যান্য তথ্য সংযুক্তি */}
                      <td className="py-2.5 px-1.5 border-r border-slate-200">
                        <div className="flex flex-col gap-1 items-stretch">
                          <button
                            type="button"
                            onClick={() =>
                              appAttachments[0]
                                ? onOpenAttachment(appAttachments[0])
                                : onSelectRecordDetail(rec.id)
                            }
                            className="inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-700 text-[10.5px] font-medium transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Paperclip className="w-2.5 h-2.5 shrink-0" />
                            <span>আবেদনপত্র</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              otherAttachments[0]
                                ? onOpenAttachment(otherAttachments[0])
                                : onSelectRecordDetail(rec.id)
                            }
                            className="inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-700 text-[10.5px] font-medium transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Paperclip className="w-2.5 h-2.5 shrink-0" />
                            <span>অন্যান্য তথ্য</span>
                          </button>
                        </div>
                      </td>

                      {/* কলাম ১১: এন্ট্রির খাতা সংযুক্তি */}
                      <td className="py-2.5 px-1.5 border-r border-slate-200 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            bookAttachments[0]
                              ? onOpenAttachment(bookAttachments[0])
                              : onSelectRecordDetail(rec.id)
                          }
                          className="inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-700 text-[10.5px] font-medium transition-colors cursor-pointer whitespace-nowrap w-full"
                        >
                          <Paperclip className="w-2.5 h-2.5 shrink-0" />
                          <span>এন্ট্রির খাতা</span>
                        </button>
                      </td>

                      {/* কলাম ১২: মন্তব্য */}
                      <td className="py-2.5 px-2 border-r border-slate-200 leading-snug text-slate-700">
                        {rec.remarks || '—'}
                      </td>

                      {/* কলাম ১৩: সম্পূর্ণ/অসম্পূর্ণ ও কার্যক্রম */}
                      <td className="py-2.5 px-1.5 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          {rec.completionStatus === 'COMPLETE' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                              সম্পূর্ণ
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[11px]">
                              অসম্পূর্ণ
                            </span>
                          )}

                          <div className="flex items-center justify-center gap-0.5 pt-1 border-t border-slate-100 w-full">
                            <button
                              type="button"
                              onClick={() => onSelectRecordDetail(rec.id)}
                              title="বিস্তারিত দেখুন"
                              aria-label={`বিস্তারিত দেখুন ${rec.registrationNo}`}
                              className="p-1 rounded hover:bg-slate-200 text-slate-700 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onEditRecord(rec)}
                              title="সম্পাদনা করুন"
                              aria-label={`সম্পাদনা করুন ${rec.registrationNo}`}
                              className="p-1 rounded hover:bg-slate-200 text-slate-700 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onPrintSingleRecord(rec)}
                              title="প্রিন্ট করুন"
                              aria-label={`প্রিন্ট করুন ${rec.registrationNo}`}
                              className="p-1 rounded hover:bg-slate-200 text-slate-700 cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            {canDeleteRecord && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingDeleteRecord(rec);
                                  setDeleteReasonBn('');
                                  setStatusBanner(null);
                                }}
                                title="ডিলিট করুন"
                                aria-label={`ডিলিট করুন ${rec.registrationNo}`}
                                className="p-1 rounded hover:bg-rose-100 text-rose-600 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer & Pagination (Matching Hospital Mockup) */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-700">
          <div className="font-medium">
            মোট {toBengaliDigits(records.length)} টি রেকর্ড পাওয়া গেছে
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label="পূর্ববর্তী পৃষ্ঠা"
                className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 rounded bg-blue-600 text-white font-bold">
                1
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                aria-label="পরবর্তী পৃষ্ঠা"
                className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span>প্রতি পৃষ্ঠায়</span>
              <select
                aria-label="প্রতি পৃষ্ঠায় রেকর্ড সংখ্যা"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 border border-slate-300 rounded bg-white text-xs"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE / TABLET CARD VIEW (Visible below lg breakpoint, matching right side of mockup) */}
      <div className="lg:hidden space-y-3">
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500 text-sm">
            জখমী রেজিস্টার লোড হচ্ছে...
          </div>
        ) : paginatedRecords.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500 text-sm">
            কোনো জখমী রেকর্ড পাওয়া যায়নি।
          </div>
        ) : (
          paginatedRecords.map((rec) => {
            const appAttachments = getAttachmentsByCategory(rec, 'APPLICATION');
            const bookAttachments = getAttachmentsByCategory(rec, 'ENTRY_BOOK');

            return (
              <div
                key={rec.id}
                className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <div className="font-bold text-slate-900 text-sm font-mono-tabular">
                      রেজি: নং: {rec.registrationNo}
                    </div>
                    <div className="text-xs text-slate-600 font-mono-tabular">
                      তারিখ: {formatDisplayDate(rec.registrationDate, false)}
                    </div>
                  </div>
                  {rec.completionStatus === 'COMPLETE' ? (
                    <span className="px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-xs shrink-0">
                      সম্পূর্ণ
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-xs shrink-0">
                      অসম্পূর্ণ
                    </span>
                  )}
                </div>

                <div className="space-y-1 text-xs text-slate-700">
                  <div className="flex items-start gap-2">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-slate-900">
                        {rec.injuredName} ({rec.injuredAge})
                      </div>
                      <div>পিতা: {rec.fatherOrGuardianName || '—'}</div>
                      <div className="text-slate-600">{rec.injuredAddress || '—'}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Stethoscope className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      {rec.doctorEntryNotFound
                        ? 'চিকিৎসকের এন্ট্রি পাচ্ছি না'
                        : rec.doctorName || '—'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      {rec.policeStationName ? `${rec.policeStationName} ` : ''}
                      মামলা নং: {rec.policeCaseNo || rec.courtCaseNo || '—'} | তারিখ:{' '}
                      {formatDisplayDate(rec.policeCaseDate || rec.courtCaseDate, true)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>এমসি প্রেরণ: {formatDisplayDate(rec.mcDispatchDate, true)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      appAttachments[0]
                        ? onOpenAttachment(appAttachments[0])
                        : onSelectRecordDetail(rec.id)
                    }
                    className="inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-blue-200 bg-blue-50/70 text-blue-700 text-xs font-medium cursor-pointer"
                  >
                    <Paperclip className="w-3 h-3" />
                    <span>আবেদনপত্র</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      bookAttachments[0]
                        ? onOpenAttachment(bookAttachments[0])
                        : onSelectRecordDetail(rec.id)
                    }
                    className="inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-blue-200 bg-blue-50/70 text-blue-700 text-xs font-medium cursor-pointer"
                  >
                    <Paperclip className="w-3 h-3" />
                    <span>এন্ট্রির খাতা</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectRecordDetail(rec.id)}
                    className="flex-1 py-1.5 px-3 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>বিস্তারিত দেখুন</span>
                    <span>→</span>
                  </button>
                  {canDeleteRecord && (
                    <button
                      type="button"
                      onClick={() => {
                        setPendingDeleteRecord(rec);
                        setDeleteReasonBn('');
                        setStatusBanner(null);
                      }}
                      aria-label={`মোবাইল ডিলিট ${rec.registrationNo}`}
                      className="py-1.5 px-3 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>ডিলিট</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
