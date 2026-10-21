import React, { useState, useEffect } from 'react';
import {
  Save,
  AlertTriangle,
  CheckCircle2,
  X,
  Upload,
} from 'lucide-react';
import { InjuryRecord } from '../types';
import {
  InjuryRecordInput,
  validateInjuryRecordInput,
  CompletionStatus,
} from '../utils/registerRules';

interface RecordFormModalProps {
  initialRecord?: InjuryRecord | null;
  authToken: string;
  onClose: () => void;
  onSaved: (savedRecord: InjuryRecord) => void;
}

interface PendingUploadFile {
  category: 'APPLICATION' | 'OTHER_INFO' | 'ENTRY_BOOK';
  fileName: string;
  mimeType: string;
  base64Data: string;
  sizeBytes: number;
}

export const RecordFormModal: React.FC<RecordFormModalProps> = ({
  initialRecord,
  authToken,
  onClose,
  onSaved,
}) => {
  const isEditing = Boolean(initialRecord);

  const todayIso = new Date().toISOString().slice(0, 10);

  const [formData, setFormData] = useState<InjuryRecordInput>({
    registrationNo: initialRecord?.registrationNo || '',
    registrationDate: initialRecord?.registrationDate || todayIso,
    injuredName: initialRecord?.injuredName || '',
    injuredAge: initialRecord?.injuredAge || '',
    fatherOrGuardianName: initialRecord?.fatherOrGuardianName || '',
    injuredAddress: initialRecord?.injuredAddress || '',
    doctorName: initialRecord?.doctorName || '',
    doctorDesignation: initialRecord?.doctorDesignation || '',
    doctorEntryNotFound: initialRecord?.doctorEntryNotFound || false,
    additionalRegNo: initialRecord?.additionalRegNo || '',
    additionalRegDate: initialRecord?.additionalRegDate || '',
    signatureNo: initialRecord?.signatureNo || '',
    signatureDate: initialRecord?.signatureDate || '',
    policeStationName: initialRecord?.policeStationName || '',
    policeCaseNo: initialRecord?.policeCaseNo || '',
    policeCaseDate: initialRecord?.policeCaseDate || '',
    courtCaseNo: initialRecord?.courtCaseNo || '',
    courtCaseDate: initialRecord?.courtCaseDate || '',
    mcDispatchDate: initialRecord?.mcDispatchDate || '',
    requiredTestReports: initialRecord?.requiredTestReports || '',
    recommenderInfo: initialRecord?.recommenderInfo || '',
    applicationAttachmentNote: initialRecord?.applicationAttachmentNote || 'আবেদনপত্র সংযুক্ত',
    otherAttachmentNote: initialRecord?.otherAttachmentNote || '',
    entryBookAttachmentNote: initialRecord?.entryBookAttachmentNote || 'এন্ট্রির খাতা সংযুক্ত',
    remarks: initialRecord?.remarks || '',
    completionStatus: (initialRecord?.completionStatus || 'INCOMPLETE') as CompletionStatus,
  });

  const [changeReasonBn, setChangeReasonBn] = useState<string>('');
  const [duplicateInfo, setDuplicateInfo] = useState<{
    isDuplicate: boolean;
    matchedRegNo?: string;
    matchedInjuredName?: string;
  }>({ isDuplicate: false });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [pendingFiles, setPendingFiles] = useState<PendingUploadFile[]>([]);

  // Live duplicate registration number check
  useEffect(() => {
    const trimmed = formData.registrationNo.trim();
    if (!trimmed) {
      setDuplicateInfo({ isDuplicate: false });
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ regNo: trimmed });
        if (initialRecord?.id) params.set('excludeId', initialRecord.id);
        const res = await fetch(`/api/records/check-duplicate?${params.toString()}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setDuplicateInfo(data);
        }
      } catch {
        // Ignore network transient check error
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [formData.registrationNo, initialRecord?.id, authToken]);

  const handleFieldChange = <K extends keyof InjuryRecordInput>(
    key: K,
    value: InjuryRecordInput[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setServerError('');
  };

  const handleFileSelect = (
    category: 'APPLICATION' | 'OTHER_INFO' | 'ENTRY_BOOK',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setServerError('ফাইলের আকার সর্বোচ্চ ৫ মেগাবাইট (5 MB) হতে পারবে।');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = String(reader.result || '');
      setPendingFiles((prev) => [
        ...prev.filter((p) => p.category !== category),
        {
          category,
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          base64Data,
          sizeBytes: file.size,
        },
      ]);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setServerError('');
    const validation = validateInjuryRecordInput(formData, false);
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      setServerError('অনুগ্রহ করে লাল চিহ্নিত বাধ্যতামূলক ঘরগুলো সঠিকভাবে পূরণ করুন।');
      return;
    }

    if (duplicateInfo.isDuplicate) {
      setServerError(
        `ডুপ্লিকেট রেজিস্ট্রেশন নম্বর (${formData.registrationNo})! এটি ইতিমধ্যে "${duplicateInfo.matchedInjuredName}"-এর জন্য ব্যবহৃত হয়েছে।`
      );
      return;
    }

    setSubmitting(true);
    try {
      const url = isEditing ? `/api/records/${initialRecord!.id}` : '/api/records';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          ...formData,
          saveAsDraft: false,
          changeReasonBn: changeReasonBn.trim() || 'জখমী রেকর্ড তথ্য হালনাগাদ',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        setServerError(data.error || 'রেকর্ড সংরক্ষণে ত্রুটি ঘটেছে।');
        setSubmitting(false);
        return;
      }

      let savedRecord: InjuryRecord = data.record;

      // Upload any attached files selected in the form
      for (const pf of pendingFiles) {
        const upRes = await fetch(`/api/records/${savedRecord.id}/attachments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            category: pf.category,
            fileName: pf.fileName,
            mimeType: pf.mimeType,
            base64Data: pf.base64Data,
          }),
        });
        if (upRes.ok) {
          const upData = await upRes.json();
          savedRecord = upData.record;
        }
      }

      onSaved(savedRecord);
    } catch {
      setServerError('সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-[#0f2942] text-white flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">
            {isEditing
              ? `জখমী রেকর্ড সম্পাদনা (${initialRecord?.registrationNo})`
              : 'নতুন জখমী রেকর্ড এন্ট্রি ফরম (১৩ কলামের সরকারি ছক)'}
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            তারকা (*) চিহ্নিত ঘরগুলো বাধ্যতামূলক। নম্বর ও তারিখ পৃথক ঘরে ইনপুট দিন।
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ফরম বন্ধ করুন"
          className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {isEditing && (
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2">
            <label
              htmlFor="change-reason-input"
              className="block font-bold text-slate-800"
            >
              সম্পাদনা / পরিবর্তনের কারণ (সংশোধন ইতিহাসে সংরক্ষিত থাকবে)
            </label>
            <input
              id="change-reason-input"
              type="text"
              value={changeReasonBn}
              onChange={(e) => setChangeReasonBn(e.target.value)}
              placeholder="যেমন: পরীক্ষার রিপোর্ট বা এমসি প্রেরণের তারিখ সংযোজন..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d6e6e]"
            />
          </div>
        )}

        {serverError && (
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-2.5"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{serverError}</span>
          </div>
        )}

        {/* SECTION 1: কলাম ১, ২ ও ৩ (প্রাথমিক রেজিস্ট্রেশন, জখমীর পরিচয় ও চিকিৎসক) */}
        <div className="border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-[#0f2942] border-b border-slate-200 pb-2">
            কলাম ১ – ৩: রেজিস্ট্রেশন নম্বর, জখমীর ব্যক্তিগত তথ্য ও চিকিৎসকের এন্ট্রি
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* কলাম ১ (অংশ ১): রেজি: নং */}
            <div>
              <label
                htmlFor="field-reg-no"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ১(ক). রেজি: নং (ম্যানুয়াল ইনপুট) <span className="text-rose-600">*</span>
              </label>
              <input
                id="field-reg-no"
                type="text"
                value={formData.registrationNo}
                onChange={(e) => handleFieldChange('registrationNo', e.target.value)}
                placeholder="যেমন: 006/2026"
                className={`w-full px-3 py-2 text-sm border rounded-lg font-mono-tabular focus:outline-none focus:ring-2 ${
                  duplicateInfo.isDuplicate || fieldErrors.registrationNo
                    ? 'border-rose-500 focus:ring-rose-500 bg-rose-50/30'
                    : 'border-slate-300 focus:ring-[#0d6e6e]'
                }`}
              />
              {duplicateInfo.isDuplicate && (
                <p className="text-xs text-rose-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    সতর্কতা: &ldquo;{duplicateInfo.matchedRegNo}&rdquo; নম্বরটি ইতিমধ্যে ({duplicateInfo.matchedInjuredName})-এর নামে ব্যবহৃত!
                  </span>
                </p>
              )}
              {!duplicateInfo.isDuplicate && formData.registrationNo.trim() && (
                <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>রেজিস্ট্রেশন নম্বরটি অনন্য (Available)</span>
                </p>
              )}
              {fieldErrors.registrationNo && (
                <p className="text-xs text-rose-600 mt-1">{fieldErrors.registrationNo}</p>
              )}
            </div>

            {/* কলাম ১ (অংশ ২): রেজি: তারিখ */}
            <div>
              <label
                htmlFor="field-reg-date"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ১(খ). রেজিস্ট্রেশনের তারিখ <span className="text-rose-600">*</span>
              </label>
              <input
                id="field-reg-date"
                type="date"
                value={formData.registrationDate}
                onChange={(e) => handleFieldChange('registrationDate', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d6e6e]"
              />
              {fieldErrors.registrationDate && (
                <p className="text-xs text-rose-600 mt-1">{fieldErrors.registrationDate}</p>
              )}
            </div>

            {/* কলাম ১৩: সম্পূর্ণ/অসম্পূর্ণ */}
            <div>
              <label
                htmlFor="field-completion-status"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ১৩. রেকর্ডের অবস্থা (সম্পূর্ণ/অসম্পূর্ণ) <span className="text-rose-600">*</span>
              </label>
              <select
                id="field-completion-status"
                value={formData.completionStatus}
                onChange={(e) =>
                  handleFieldChange('completionStatus', e.target.value as CompletionStatus)
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0d6e6e]"
              >
                <option value="INCOMPLETE">অসম্পূর্ণ (পরীক্ষা/এমসি বাকি)</option>
                <option value="COMPLETE">সম্পূর্ণ (সকল তথ্য ও প্রতিবেদন পূর্ণাঙ্গ)</option>
              </select>
            </div>
          </div>

          {/* কলাম ২: জখমীর নাম, বয়স, পিতার নাম ও ঠিকানা */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-2">
            <div className="md:col-span-5">
              <label
                htmlFor="field-injured-name"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ২(ক). জখমীর পূর্ণ নাম <span className="text-rose-600">*</span>
              </label>
              <input
                id="field-injured-name"
                type="text"
                value={formData.injuredName}
                onChange={(e) => handleFieldChange('injuredName', e.target.value)}
                placeholder="যেমন: মোঃ রাকিবুল ইসলাম"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d6e6e]"
              />
              {fieldErrors.injuredName && (
                <p className="text-xs text-rose-600 mt-1">{fieldErrors.injuredName}</p>
              )}
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="field-injured-age"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ২(খ). বয়স (বছর) <span className="text-rose-600">*</span>
              </label>
              <input
                id="field-injured-age"
                type="text"
                value={formData.injuredAge}
                onChange={(e) => handleFieldChange('injuredAge', e.target.value)}
                placeholder="যেমন: ৩০"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d6e6e]"
              />
              {fieldErrors.injuredAge && (
                <p className="text-xs text-rose-600 mt-1">{fieldErrors.injuredAge}</p>
              )}
            </div>

            <div className="md:col-span-5">
              <label
                htmlFor="field-father-name"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ২(গ). পিতা / স্বামীর নাম <span className="text-rose-600">*</span>
              </label>
              <input
                id="field-father-name"
                type="text"
                value={formData.fatherOrGuardianName}
                onChange={(e) => handleFieldChange('fatherOrGuardianName', e.target.value)}
                placeholder="যেমন: আব্দুল মান্নান"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d6e6e]"
              />
              {fieldErrors.fatherOrGuardianName && (
                <p className="text-xs text-rose-600 mt-1">{fieldErrors.fatherOrGuardianName}</p>
              )}
            </div>

            <div className="md:col-span-12">
              <label
                htmlFor="field-injured-address"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ২(ঘ). জখমীর পূর্ণ ঠিকানা (গ্রাম/মহল্লা, উপজেলা/থানা, জেলা) <span className="text-rose-600">*</span>
              </label>
              <input
                id="field-injured-address"
                type="text"
                value={formData.injuredAddress}
                onChange={(e) => handleFieldChange('injuredAddress', e.target.value)}
                placeholder="যেমন: বড় বাজার, কিশোরগঞ্জ সদর, কিশোরগঞ্জ।"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d6e6e]"
              />
              {fieldErrors.injuredAddress && (
                <p className="text-xs text-rose-600 mt-1">{fieldErrors.injuredAddress}</p>
              )}
            </div>
          </div>

          {/* কলাম ৩: চিকিৎসকের নাম / এন্ট্রি পাচ্ছি না */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-2 items-end">
            <div className="md:col-span-6">
              <label
                htmlFor="field-doctor-name"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ৩. চিকিৎসকের নাম ও বিভাগ <span className="text-rose-600">*</span>
              </label>
              <input
                id="field-doctor-name"
                type="text"
                disabled={Boolean(formData.doctorEntryNotFound)}
                value={formData.doctorName}
                onChange={(e) => handleFieldChange('doctorName', e.target.value)}
                placeholder="যেমন: ডা. সাইফুল ইসলাম (মেডিসিন)"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0d6e6e]"
              />
              {fieldErrors.doctorName && (
                <p className="text-xs text-rose-600 mt-1">{fieldErrors.doctorName}</p>
              )}
            </div>

            <div className="md:col-span-6 pb-1.5">
              <label className="inline-flex items-center gap-2.5 cursor-pointer select-none text-sm text-slate-800 font-medium">
                <input
                  type="checkbox"
                  checked={Boolean(formData.doctorEntryNotFound)}
                  onChange={(e) =>
                    handleFieldChange('doctorEntryNotFound', e.target.checked)
                  }
                  className="w-4 h-4 rounded border-slate-300 text-[#0d6e6e] focus:ring-[#0d6e6e]"
                />
                <span>চিকিৎসকের নাম / এন্ট্রি পাচ্ছি না (কলাম ৩ বিকল্প)</span>
              </label>
            </div>
          </div>
        </div>

        {/* SECTION 2: কলাম ৪ – ৯ (অতিরিক্ত রেজি:, অত্র প্রতিষ্ঠানের স্মারক নম্বর ও তারিখ, থানা/কোর্ট মামলা, এমসি প্রেরণ, পরীক্ষা ও সুপারিশকারী) */}
        <div className="border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-[#0f2942] border-b border-slate-200 pb-2">
            কলাম ৪ – ৯: অতিরিক্ত রেজি:, অত্র প্রতিষ্ঠানের স্মারক নম্বর ও তারিখ, থানা/কোর্ট মামলা, এমসি প্রেরণ ও পরীক্ষার বিবরণ
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label
                htmlFor="field-add-reg-no"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ৪(ক). অতিরিক্ত রেজি: নং
              </label>
              <input
                id="field-add-reg-no"
                type="text"
                value={formData.additionalRegNo}
                onChange={(e) => handleFieldChange('additionalRegNo', e.target.value)}
                placeholder="যেমন: ১২৩/2026"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="field-add-reg-date"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ৪(খ). অতিরিক্ত রেজি: তারিখ
              </label>
              <input
                id="field-add-reg-date"
                type="date"
                value={formData.additionalRegDate}
                onChange={(e) => handleFieldChange('additionalRegDate', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="field-sig-no"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ৫(ক). অত্র প্রতিষ্ঠানের স্মারক নম্বর
              </label>
              <input
                id="field-sig-no"
                type="text"
                value={formData.signatureNo}
                onChange={(e) => handleFieldChange('signatureNo', e.target.value)}
                placeholder="যেমন: স্মারক-০১"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="field-sig-date"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ৫(খ). অত্র প্রতিষ্ঠানের স্মারকের তারিখ
              </label>
              <input
                id="field-sig-date"
                type="date"
                value={formData.signatureDate}
                onChange={(e) => handleFieldChange('signatureDate', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* কলাম ৬: থানার মামলা নম্বর ও তারিখ / কোর্টের মামলা নম্বর ও তারিখ */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-1">
            <div>
              <label
                htmlFor="field-police-station"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ৬(ক). থানার নাম
              </label>
              <input
                id="field-police-station"
                type="text"
                value={formData.policeStationName}
                onChange={(e) => handleFieldChange('policeStationName', e.target.value)}
                placeholder="যেমন: কিশোরগঞ্জ থানা"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="field-police-case-no"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ৬(খ). থানার মামলা নম্বর
              </label>
              <input
                id="field-police-case-no"
                type="text"
                value={formData.policeCaseNo}
                onChange={(e) => handleFieldChange('policeCaseNo', e.target.value)}
                placeholder="যেমন: ১২৩/২০২৬"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="field-police-case-date"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ৬(গ). থানার মামলার তারিখ
              </label>
              <input
                id="field-police-case-date"
                type="date"
                value={formData.policeCaseDate}
                onChange={(e) => handleFieldChange('policeCaseDate', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="field-court-case-no"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ৬(ঘ). কোর্টের মামলা নম্বর
              </label>
              <input
                id="field-court-case-no"
                type="text"
                value={formData.courtCaseNo}
                onChange={(e) => handleFieldChange('courtCaseNo', e.target.value)}
                placeholder="থাকলে লিখুন"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="field-court-case-date"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ৬(ঙ). কোর্টের মামলার তারিখ
              </label>
              <input
                id="field-court-case-date"
                type="date"
                value={formData.courtCaseDate}
                onChange={(e) => handleFieldChange('courtCaseDate', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* কলাম ৭, ৮, ৯ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div>
              <label
                htmlFor="field-mc-date"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ৭. এমসি (MC) প্রেরণের তারিখ
              </label>
              <input
                id="field-mc-date"
                type="date"
                value={formData.mcDispatchDate}
                onChange={(e) => handleFieldChange('mcDispatchDate', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="field-test-reports"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ৮. কি কি পরীক্ষা রিপোর্ট লাগবে
              </label>
              <input
                id="field-test-reports"
                type="text"
                value={formData.requiredTestReports}
                onChange={(e) => handleFieldChange('requiredTestReports', e.target.value)}
                placeholder="যেমন: X-Ray, CBC, CT Scan"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="field-recommender"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ৯. সুপারিশকারী যদি থাকে
              </label>
              <input
                id="field-recommender"
                type="text"
                value={formData.recommenderInfo}
                onChange={(e) => handleFieldChange('recommenderInfo', e.target.value)}
                placeholder="যেমন: ডা. করিম আহমেদ"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* SECTION 3: কলাম ১০, ১১ ও ১২ (সংযুক্তি ফাইল আপলোড ও মন্তব্য) */}
        <div className="border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-[#0f2942] border-b border-slate-200 pb-2">
            কলাম ১০, ১১ ও ১২: সংযুক্তি নথি (নিরাপদ প্রাইভেট স্টোরেজ) ও মন্তব্য
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ১০(ক). আবেদনপত্র সংযুক্তি (PDF/JPG/PNG)
              </label>
              <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-white border border-slate-300 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#0d6e6e]" />
                <span>ফাইল নির্বাচন করুন</span>
                <input
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => handleFileSelect('APPLICATION', e)}
                  className="hidden"
                />
              </label>
              <div className="text-[11px] text-slate-500 mt-1.5">
                {pendingFiles.find((f) => f.category === 'APPLICATION')?.fileName ||
                  'সর্বোচ্চ ৫ মেগাবাইট'}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ১০(খ). অন্যান্য তথ্য সংযুক্তি (PDF/JPG/PNG)
              </label>
              <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-white border border-slate-300 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#0d6e6e]" />
                <span>ফাইল নির্বাচন করুন</span>
                <input
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => handleFileSelect('OTHER_INFO', e)}
                  className="hidden"
                />
              </label>
              <div className="text-[11px] text-slate-500 mt-1.5">
                {pendingFiles.find((f) => f.category === 'OTHER_INFO')?.fileName ||
                  'থানার রিকুইজিশন / অন্যান্য নথি'}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ১১. এন্ট্রির খাতা সংযুক্তি (PDF/JPG/PNG)
              </label>
              <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-white border border-slate-300 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#0d6e6e]" />
                <span>ফাইল নির্বাচন করুন</span>
                <input
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => handleFileSelect('ENTRY_BOOK', e)}
                  className="hidden"
                />
              </label>
              <div className="text-[11px] text-slate-500 mt-1.5">
                {pendingFiles.find((f) => f.category === 'ENTRY_BOOK')?.fileName ||
                  'জরুরি বিভাগের খাতার স্ক্যান কপি'}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="field-remarks"
              className="block text-xs font-bold text-slate-700 mb-1"
            >
              ১২. মন্তব্য
            </label>
            <textarea
              id="field-remarks"
              rows={2}
              value={formData.remarks}
              onChange={(e) => handleFieldChange('remarks', e.target.value)}
              placeholder="যেমন: রোগী ভর্তিধীন / পরীক্ষার জন্য অপেক্ষা / অতিরিক্ত পরীক্ষা প্রয়োজন..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d6e6e]"
            />
          </div>
        </div>

        {/* Form Actions Footer */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm font-medium cursor-pointer"
          >
            বাতিল করুন
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0d6e6e] hover:bg-[#0a5858] text-white text-sm font-semibold cursor-pointer disabled:opacity-50 shadow-xs"
          >
            <Save className="w-4 h-4" />
            <span>{isEditing ? 'পরিবর্তন সংরক্ষণ করুন' : 'রেজিস্টারে সংরক্ষণ করুন'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
