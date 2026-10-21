import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Printer,
  Paperclip,
  Upload,
  Trash2,
  History,
  Lock,
} from 'lucide-react';
import { InjuryRecord, UserSession, AttachmentItem } from '../types';
import {
  formatDisplayDate,
  toBengaliDigits,
} from '../utils/registerRules';

interface RecordDetailModalProps {
  record: InjuryRecord;
  currentUser: UserSession;
  authToken: string;
  onClose: () => void;
  onEdit: (record: InjuryRecord) => void;
  onPrintSingle: (record: InjuryRecord) => void;
  onDeleteRecord: (recordId: string, reasonBn: string) => Promise<{ ok: boolean; messageBn: string }>;
  canDeleteRecord: boolean;
  onRecordUpdated: (updated: InjuryRecord) => void;
  onOpenAttachment: (att: AttachmentItem) => void;
}

const CATEGORY_LABELS_BN: Record<string, string> = {
  APPLICATION: 'আবেদনপত্র সংযুক্তি (কলাম ১০)',
  OTHER_INFO: 'অন্যান্য তথ্য সংযুক্তি (কলাম ১০)',
  ENTRY_BOOK: 'এন্ট্রির খাতা সংযুক্তি (কলাম ১১)',
  TEST_REPORT: 'পরীক্ষার রিপোর্ট সংযুক্তি (কলাম ৮)',
};

export const RecordDetailModal: React.FC<RecordDetailModalProps> = ({
  record,
  currentUser,
  authToken,
  onClose,
  onEdit,
  onPrintSingle,
  onDeleteRecord,
  canDeleteRecord,
  onRecordUpdated,
  onOpenAttachment,
}) => {
  const [actionError, setActionError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<
    'APPLICATION' | 'OTHER_INFO' | 'ENTRY_BOOK' | 'TEST_REPORT'
  >('APPLICATION');
  const [deleteReasonBn, setDeleteReasonBn] = useState('');
  const [deletingAttId, setDeletingAttId] = useState<string | null>(null);
  const [confirmingRecordDelete, setConfirmingRecordDelete] = useState(false);
  const [recordDeleteReasonBn, setRecordDeleteReasonBn] = useState('');

  const canUpload = currentUser.permissions.includes('ATTACHMENT_UPLOAD');
  const canDeleteAtt = currentUser.permissions.includes('ATTACHMENT_DELETE');

  const handleDirectUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setActionError('ফাইলের আকার সর্বোচ্চ ৫ মেগাবাইট হতে পারবে।');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      setProcessing(true);
      try {
        const res = await fetch(`/api/records/${record.id}/attachments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            category: uploadCategory,
            fileName: file.name,
            mimeType: file.type || 'application/pdf',
            base64Data: String(reader.result || ''),
          }),
        });
        const data = await res.json();
        if (res.ok) {
          onRecordUpdated(data.record);
        } else {
          setActionError(data.error || 'ফাইল আপলোডে ত্রুটি।');
        }
      } finally {
        setProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmDeleteAttachment = async (attId: string) => {
    if (!deleteReasonBn.trim()) {
      setActionError('সংযুক্তি অপসারণের কারণ উল্লেখ করুন।');
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch(`/api/attachments/${attId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ reasonBn: deleteReasonBn.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setDeletingAttId(null);
        setDeleteReasonBn('');
        onRecordUpdated(data.record);
      } else {
        setActionError(data.error || 'ফাইল অপসারণ করা যায়নি।');
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden space-y-0">
      {/* Header Bar */}
      <div className="px-6 py-4 bg-[#0f2942] text-white flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold font-mono-tabular">
              রেজি: নং {record.registrationNo} — {record.injuredName} ({record.injuredAge})
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded bg-white/15 text-teal-200 font-medium">
              {record.completionStatus === 'COMPLETE' ? 'সম্পূর্ণ রেকর্ড' : 'অসম্পূর্ণ রেকর্ড'}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1 font-mono-tabular">
            স্থায়ী Internal ID: {record.id} · সংস্করণ (Revision): #{toBengaliDigits(record.revisionCount)} · রেজি: তারিখ: {formatDisplayDate(record.registrationDate, true)} · এন্ট্রিকারী: {record.createdByNameBn}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(record)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>সম্পাদনা</span>
          </button>
          <button
            type="button"
            onClick={() => onPrintSingle(record)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0d6e6e] hover:bg-[#0a5858] text-white text-xs font-semibold cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>একক প্রিন্ট</span>
          </button>
          {canDeleteRecord && (
            <button
              type="button"
              onClick={() => setConfirmingRecordDelete((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>ডিলিট</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="বিস্তারিত ভিউ বন্ধ করুন"
            className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {actionError && (
          <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">
            {actionError}
          </div>
        )}

        {confirmingRecordDelete && (
          <div className="p-4 rounded-xl bg-rose-50 border-2 border-rose-300 space-y-3">
            <div className="text-sm font-bold text-rose-950">
              আপনি কি নিশ্চিতভাবে এই জখমী রেকর্ডটি (রেজি: নং {record.registrationNo} — {record.injuredName}) ডিলিট করতে চান?
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <input
                type="text"
                value={recordDeleteReasonBn}
                onChange={(e) => setRecordDeleteReasonBn(e.target.value)}
                placeholder="ডিলিট করার কারণ লিখুন (ঐচ্ছিক)..."
                className="flex-1 px-3 py-2 text-xs bg-white border border-rose-300 rounded-lg"
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmingRecordDelete(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  disabled={processing}
                  onClick={async () => {
                    setProcessing(true);
                    const res = await onDeleteRecord(record.id, recordDeleteReasonBn.trim());
                    setProcessing(false);
                    if (!res.ok) {
                      setActionError(res.messageBn);
                    }
                  }}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  নিশ্চিত ডিলিট করুন
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Complete 13-Column Structured Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Card 1: Columns 1, 2, 3, 12, 13 */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-[#0f2942] border-b border-slate-200 pb-2">
              জখমী ও চিকিৎসকের তথ্য (কলাম ১, ২, ৩, ১২, ১৩)
            </h3>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <dt className="text-slate-500">১. রেজি: নং ও তারিখ:</dt>
                <dd className="font-bold text-slate-900 font-mono-tabular">
                  {record.registrationNo} ({formatDisplayDate(record.registrationDate, true)})
                </dd>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <dt className="text-slate-500">২. জখমীর নাম ও বয়স:</dt>
                <dd className="font-bold text-slate-900">
                  {record.injuredName} ({record.injuredAge})
                </dd>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <dt className="text-slate-500">পিতা/অভিভাবক:</dt>
                <dd className="text-slate-800">{record.fatherOrGuardianName || '—'}</dd>
              </div>
              <div className="py-1 border-b border-slate-100">
                <dt className="text-slate-500">ঠিকানা:</dt>
                <dd className="text-slate-800 mt-0.5 font-medium">{record.injuredAddress}</dd>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <dt className="text-slate-500">৩. চিকিৎসকের নাম:</dt>
                <dd className="font-semibold text-slate-900">
                  {record.doctorEntryNotFound ? 'এন্ট্রি পাচ্ছি না' : record.doctorName || '—'}
                </dd>
              </div>
              <div className="py-1 border-b border-slate-100">
                <dt className="text-slate-500">১২. মন্তব্য:</dt>
                <dd className="text-slate-800 mt-0.5">{record.remarks || '—'}</dd>
              </div>
              <div className="flex justify-between items-center pt-1">
                <dt className="text-slate-500">১৩. সম্পূর্ণ/অসম্পূর্ণ অবস্থা:</dt>
                <dd>
                  {record.completionStatus === 'COMPLETE' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>সম্পূর্ণ</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>অসম্পূর্ণ</span>
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {/* Card 2: Legal & Case Details (Columns 4, 5, 6, 7, 8, 9) */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-[#0f2942]">
                আইনগত ও মামলা সংক্রান্ত তথ্য (কলাম ৪ – ৯)
              </h3>
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <Lock className="w-3 h-3" /> সংরক্ষিত
              </span>
            </div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <dt className="text-slate-500">৪. অতিরিক্ত রেজি: নং ও তারিখ:</dt>
                <dd className="font-mono-tabular font-medium text-slate-900">
                  {record.additionalRegNo || '—'}{' '}
                  {record.additionalRegDate
                    ? `(${formatDisplayDate(record.additionalRegDate, true)})`
                    : ''}
                </dd>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <dt className="text-slate-500">৫. অত্র প্রতিষ্ঠানের স্মারক নম্বর ও তারিখ:</dt>
                <dd className="font-mono-tabular font-medium text-slate-900">
                  {record.signatureNo || '—'}{' '}
                  {record.signatureDate
                    ? `(${formatDisplayDate(record.signatureDate, true)})`
                    : ''}
                </dd>
              </div>
              <div className="py-1 border-b border-slate-100">
                <dt className="text-slate-500">৬(ক). থানার নাম ও মামলা নম্বর:</dt>
                <dd className="font-semibold text-slate-900 mt-0.5">
                  {record.policeStationName || '—'} | মামলা নং: {record.policeCaseNo || '—'} (
                  {formatDisplayDate(record.policeCaseDate, true)})
                </dd>
              </div>
              <div className="py-1 border-b border-slate-100">
                <dt className="text-slate-500">৬(খ). কোর্টের মামলা নম্বর ও তারিখ:</dt>
                <dd className="font-medium text-slate-800 mt-0.5">
                  {record.courtCaseNo || '—'}{' '}
                  {record.courtCaseDate
                    ? `(${formatDisplayDate(record.courtCaseDate, true)})`
                    : ''}
                </dd>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <dt className="text-slate-500">৭. এমসি প্রেরণের তারিখ:</dt>
                <dd className="font-bold text-slate-900 font-mono-tabular">
                  {formatDisplayDate(record.mcDispatchDate, true)}
                </dd>
              </div>
              <div className="py-1 border-b border-slate-100">
                <dt className="text-slate-500">৮. প্রয়োজনীয় পরীক্ষা রিপোর্ট:</dt>
                <dd className="font-medium text-slate-900 mt-0.5">
                  {record.requiredTestReports || '—'}
                </dd>
              </div>
              <div className="flex justify-between pt-1">
                <dt className="text-slate-500">৯. সুপারিশকারী:</dt>
                <dd className="font-medium text-slate-900">{record.recommenderInfo || '—'}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Protected Attachments Section (Columns 10 & 11) */}
        <div className="border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-[#0f2942]">
                সংযুক্তি নথি ব্যবস্থাপনা (কলাম ১০ ও ১১ — আবেদনপত্র, অন্যান্য তথ্য ও এন্ট্রির খাতা)
              </h3>
              <p className="text-xs text-slate-500">
                সকল ফাইল পাবলিক URL-এর বাইরে সংরক্ষিত এবং শুধুমাত্র অনুমোদিত টোকেন যাচাইয়ের মাধ্যমে দেখা ও ডাউনলোড করা যায়।
              </p>
            </div>

            {canUpload && (
              <div className="flex items-center gap-2">
                <select
                  aria-label="সংযুক্তির ধরন নির্বাচন"
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as any)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="APPLICATION">১০(ক). আবেদনপত্র</option>
                  <option value="OTHER_INFO">১০(খ). অন্যান্য তথ্য</option>
                  <option value="ENTRY_BOOK">১১. এন্ট্রির খাতা</option>
                  <option value="TEST_REPORT">৮. পরীক্ষার রিপোর্ট</option>
                </select>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d6e6e] hover:bg-[#0a5858] text-white text-xs font-semibold cursor-pointer whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5" />
                  <span>নতুন সংযুক্তি যোগ</span>
                  <input
                    type="file"
                    disabled={processing}
                    accept=".pdf,image/jpeg,image/png,image/webp"
                    onChange={handleDirectUpload}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(record.attachments || []).map((att) => (
              <div
                key={att.id}
                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-bold text-[#0f2942]">
                    {CATEGORY_LABELS_BN[att.category] || att.category}
                  </div>
                  <div className="text-slate-700 font-medium truncate mt-0.5">
                    {att.originalName}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 font-mono-tabular">
                    আকার: {(att.fileSizeBytes / 1024).toFixed(1)} KB · আপলোডকারী: {att.uploadedByNameBn}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => onOpenAttachment(att)}
                    className="inline-flex items-center gap-1 text-blue-700 hover:underline font-semibold cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>দেখুন / ডাউনলোড</span>
                  </button>

                  {canDeleteAtt && (
                    <button
                      type="button"
                      onClick={() => setDeletingAttId(att.id)}
                      className="inline-flex items-center gap-1 text-rose-600 hover:underline cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>অপসারণ</span>
                    </button>
                  )}
                </div>

                {deletingAttId === att.id && (
                  <div className="mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded-lg space-y-2">
                    <input
                      type="text"
                      value={deleteReasonBn}
                      onChange={(e) => setDeleteReasonBn(e.target.value)}
                      placeholder="অপসারণের কারণ লিখুন..."
                      className="w-full px-2 py-1 text-xs bg-white border border-rose-300 rounded"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDeletingAttId(null)}
                        className="px-2 py-1 text-[11px] text-slate-600"
                      >
                        বাতিল
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmDeleteAttachment(att.id)}
                        className="px-2.5 py-1 text-[11px] bg-rose-600 text-white rounded font-semibold"
                      >
                        নিশ্চিত করুন
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Immutable Revisions History */}
        <div className="border border-slate-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-[#0f2942] border-b border-slate-200 pb-2 flex items-center gap-1.5">
            <History className="w-4 h-4 text-amber-600" />
            <span>তথ্য পরিবর্তনের অপরিবর্তনীয় ইতিহাস (Record Revisions)</span>
          </h3>
          {(record.revisions || []).length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              এই রেকর্ডটি প্রাথমিক এন্ট্রির পর এখনো সংশোধন করা হয়নি (সংস্করণ #১)।
            </p>
          ) : (
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {(record.revisions || []).map((rev) => {
                let parsedDiffs: Array<{ field: string; before: any; after: any }> = [];
                try {
                  parsedDiffs = JSON.parse(rev.changed_fields_json || '[]');
                } catch {
                  parsedDiffs = [];
                }
                return (
                  <div
                    key={rev.id}
                    className="p-3 rounded-lg bg-amber-50/50 border border-amber-200 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between font-bold text-slate-900">
                      <span>
                        সংস্করণ #{toBengaliDigits(rev.revision_no)} — {rev.changed_by_name_bn}
                      </span>
                    </div>
                    <div className="text-slate-700 font-medium">
                      কারণ: {rev.change_reason_bn}
                    </div>
                    {parsedDiffs.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-amber-200/60 text-[11px]">
                        {parsedDiffs.map((d, idx) => (
                          <div key={idx} className="text-slate-700 font-mono-tabular">
                            <span className="font-bold">{d.field}:</span> &ldquo;{String(d.before)}&rdquo; → &ldquo;{String(d.after)}&rdquo;
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

