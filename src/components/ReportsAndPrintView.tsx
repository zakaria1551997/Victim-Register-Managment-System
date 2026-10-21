import React, { useState, useMemo } from 'react';
import {
  Printer,
  FileSpreadsheet,
  ArrowLeft,
} from 'lucide-react';
import { InjuryRecord } from '../types';
import {
  formatDisplayDate,
  toBengaliDigits,
} from '../utils/registerRules';

interface ReportsAndPrintViewProps {
  records: InjuryRecord[];
  singlePrintRecord: InjuryRecord | null;
  onClearSinglePrint: () => void;
}

export const ReportsAndPrintView: React.FC<ReportsAndPrintViewProps> = ({
  records,
  singlePrintRecord,
  onClearSinglePrint,
}) => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentMonthPrefix = todayIso.slice(0, 7);
  const currentYearPrefix = todayIso.slice(0, 4);

  const [reportPeriod, setReportPeriod] = useState<
    'ALL' | 'DAILY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM'
  >('ALL');
  const [customFrom, setCustomFrom] = useState('2026-01-01');
  const [customTo, setCustomTo] = useState(todayIso);
  const [completionFilter, setCompletionFilter] = useState<'ALL' | 'COMPLETE' | 'INCOMPLETE'>(
    'ALL'
  );
  const [regOrCaseSearch, setRegOrCaseSearch] = useState('');

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (reportPeriod === 'DAILY' && r.registrationDate !== todayIso) return false;
      if (reportPeriod === 'MONTHLY' && !r.registrationDate.startsWith(currentMonthPrefix))
        return false;
      if (reportPeriod === 'YEARLY' && !r.registrationDate.startsWith(currentYearPrefix))
        return false;
      if (reportPeriod === 'CUSTOM') {
        if (customFrom && r.registrationDate < customFrom) return false;
        if (customTo && r.registrationDate > customTo) return false;
      }
      if (completionFilter !== 'ALL' && r.completionStatus !== completionFilter) {
        return false;
      }
      if (regOrCaseSearch.trim()) {
        const q = regOrCaseSearch.trim().toLowerCase();
        const hay = `${r.registrationNo} ${r.injuredName} ${r.policeCaseNo} ${r.courtCaseNo} ${r.policeStationName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    records,
    reportPeriod,
    todayIso,
    currentMonthPrefix,
    currentYearPrefix,
    customFrom,
    customTo,
    completionFilter,
    regOrCaseSearch,
  ]);

  const handlePrint = () => {
    window.print();
  };

  // Single Record Print Mode
  if (singlePrintRecord) {
    const r = singlePrintRecord;
    return (
      <div className="space-y-4 print-container">
        <div className="no-print bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onClearSinglePrint}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>সম্পূর্ণ রেজিস্টার রিপোর্টে ফিরে যান</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0d6e6e] hover:bg-[#0a5858] text-white text-sm font-semibold cursor-pointer shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>একক জখমী রেকর্ড প্রিন্ট / PDF সংরক্ষণ করুন</span>
          </button>
        </div>

        <div className="bg-white border border-slate-300 rounded-xl p-8 max-w-4xl mx-auto space-y-6">
          <div className="text-center border-b-2 border-slate-800 pb-4">
            <h1 className="text-xl font-bold text-slate-900">
              গণপ্রজাতন্ত্রী বাংলাদেশ সরকার
            </h1>
            <h2 className="text-lg font-bold text-[#0f2942] mt-0.5">
              শহীদ সৈয়দ নজরুল ইসলাম মেডিকেল কলেজ হাসপাতাল, কিশোরগঞ্জ
            </h2>
            <p className="text-sm font-semibold text-slate-700 mt-1">
              একক জখমী রেজিস্টার বিবরণী পত্র (Official Single Injury Register Sheet)
            </p>
          </div>

          <div className="flex justify-between text-xs font-mono-tabular border-b border-slate-200 pb-3">
            <div>
              <strong>স্থায়ী Internal ID:</strong> {r.id}
            </div>
            <div>
              <strong>রেকর্ডের অবস্থা:</strong>{' '}
              {r.completionStatus === 'COMPLETE' ? 'সম্পূর্ণ' : 'অসম্পূর্ণ'}
            </div>
            <div>
              <strong>মুদ্রণের তারিখ:</strong> {formatDisplayDate(todayIso, true)}
            </div>
          </div>

          <table className="w-full border-collapse border border-slate-400 text-sm">
            <tbody>
              <tr>
                <th className="border border-slate-400 bg-slate-100 p-2.5 text-left w-1/3">
                  ১. রেজি: নং ও তারিখ
                </th>
                <td className="border border-slate-400 p-2.5 font-bold font-mono-tabular">
                  রেজি: নং: {r.registrationNo} | তারিখ: {formatDisplayDate(r.registrationDate, true)}
                </td>
              </tr>
              <tr>
                <th className="border border-slate-400 bg-slate-100 p-2.5 text-left">
                  ২. জখমীর নাম, বয়স, পিতার ও ঠিকানা
                </th>
                <td className="border border-slate-400 p-2.5">
                  <div>
                    <strong>নাম:</strong> {r.injuredName} (বয়স: {r.injuredAge})
                  </div>
                  <div>
                    <strong>পিতা/অভিভাবক:</strong> {r.fatherOrGuardianName}
                  </div>
                  <div>
                    <strong>ঠিকানা:</strong> {r.injuredAddress}
                  </div>
                </td>
              </tr>
              <tr>
                <th className="border border-slate-400 bg-slate-100 p-2.5 text-left">
                  ৩. চিকিৎসকের নাম/এন্ট্রি পাচ্ছি না
                </th>
                <td className="border border-slate-400 p-2.5">
                  {r.doctorEntryNotFound ? 'এন্ট্রি পাচ্ছি না' : r.doctorName || '—'}
                </td>
              </tr>
              <tr>
                <th className="border border-slate-400 bg-slate-100 p-2.5 text-left">
                  ৪. অতিরিক্ত রেজি: নং ও তারিখ
                </th>
                <td className="border border-slate-400 p-2.5 font-mono-tabular">
                  {r.additionalRegNo || '—'}{' '}
                  {r.additionalRegDate
                    ? `(তারিখ: ${formatDisplayDate(r.additionalRegDate, true)})`
                    : ''}
                </td>
              </tr>
              <tr>
                <th className="border border-slate-400 bg-slate-100 p-2.5 text-left">
                  ৫. অত্র প্রতিষ্ঠানের স্মারক নম্বর ও তারিখ
                </th>
                <td className="border border-slate-400 p-2.5 font-mono-tabular">
                  {r.signatureNo || '—'}{' '}
                  {r.signatureDate
                    ? `(তারিখ: ${formatDisplayDate(r.signatureDate, true)})`
                    : ''}
                </td>
              </tr>
              <tr>
                <th className="border border-slate-400 bg-slate-100 p-2.5 text-left">
                  ৬. থানার মামলা নম্বর ও তারিখ/কোর্টের মামলা নম্বর ও তারিখ
                </th>
                <td className="border border-slate-400 p-2.5">
                  <div>
                    থানা: {r.policeStationName || '—'} | মামলা নং: {r.policeCaseNo || '—'} | তারিখ:{' '}
                    {formatDisplayDate(r.policeCaseDate, true)}
                  </div>
                  {r.courtCaseNo && (
                    <div>
                      কোর্ট মামলা নং: {r.courtCaseNo} | তারিখ:{' '}
                      {formatDisplayDate(r.courtCaseDate, true)}
                    </div>
                  )}
                </td>
              </tr>
              <tr>
                <th className="border border-slate-400 bg-slate-100 p-2.5 text-left">
                  ৭. এমসি প্রেরণের তারিখ
                </th>
                <td className="border border-slate-400 p-2.5 font-mono-tabular">
                  {formatDisplayDate(r.mcDispatchDate, true)}
                </td>
              </tr>
              <tr>
                <th className="border border-slate-400 bg-slate-100 p-2.5 text-left">
                  ৮. কি কি পরীক্ষা রিপোর্ট লাগবে
                </th>
                <td className="border border-slate-400 p-2.5">{r.requiredTestReports || '—'}</td>
              </tr>
              <tr>
                <th className="border border-slate-400 bg-slate-100 p-2.5 text-left">
                  ৯. সুপারিশকারী যদি থাকে
                </th>
                <td className="border border-slate-400 p-2.5">{r.recommenderInfo || '—'}</td>
              </tr>
              <tr>
                <th className="border border-slate-400 bg-slate-100 p-2.5 text-left">
                  ১০. আবেদনপত্র সংযুক্তি/অন্যান্য তথ্য সংযুক্তি
                </th>
                <td className="border border-slate-400 p-2.5">
                  {r.applicationAttachmentNote || 'সংযুক্ত'} / {r.otherAttachmentNote || '—'}
                </td>
              </tr>
              <tr>
                <th className="border border-slate-400 bg-slate-100 p-2.5 text-left">
                  ১১. এন্ট্রির খাতা সংযুক্তি
                </th>
                <td className="border border-slate-400 p-2.5">
                  {r.entryBookAttachmentNote || 'সংযুক্ত'}
                </td>
              </tr>
              <tr>
                <th className="border border-slate-400 bg-slate-100 p-2.5 text-left">
                  ১২. মন্তব্য
                </th>
                <td className="border border-slate-400 p-2.5">{r.remarks || '—'}</td>
              </tr>
              <tr>
                <th className="border border-slate-400 bg-slate-100 p-2.5 text-left">
                  ১৩. সম্পূর্ণ/অসম্পূর্ণ
                </th>
                <td className="border border-slate-400 p-2.5 font-bold">
                  {r.completionStatus === 'COMPLETE' ? 'সম্পূর্ণ' : 'অসম্পূর্ণ'}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="grid grid-cols-3 gap-6 pt-12 text-center text-xs text-slate-800">
            <div className="border-t border-slate-600 pt-2">
              <div className="font-bold">ডাটা এন্ট্রি অপারেটর / রেকর্ড কিপার</div>
              <div>({r.createdByNameBn})</div>
            </div>
            <div className="border-t border-slate-600 pt-2">
              <div className="font-bold">আবাসিক মেডিকেল অফিসার (RMO)</div>
              <div>(স্বাক্ষর ও সিল)</div>
            </div>
            <div className="border-t border-slate-600 pt-2">
              <div className="font-bold">উপ-পরিচালক / তত্ত্বাবধায়ক</div>
              <div>(হাসপাতাল কর্তৃপক্ষ)</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 print-container">
      {/* Report Filter Controls (Hidden during Print) */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-xl font-bold text-[#0f2942] flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-[#0d6e6e]" />
              <span>রিপোর্ট ও অফিশিয়াল রেজিস্টার প্রিন্ট (A4 Landscape / PDF)</span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              দৈনিক, মাসিক, বার্ষিক, তারিখের সীমা এবং সম্পূর্ণ/অসম্পূর্ণ রেকর্ডের অফিশিয়াল ১৩ কলামের রেজিস্টার প্রিন্ট ভিউ
            </p>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0d6e6e] hover:bg-[#0a5858] text-white text-sm font-semibold cursor-pointer shadow-xs whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>কাগজের রেজিস্টার প্রিন্ট / PDF Export</span>
          </button>
        </div>

        {/* Segmented Period Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'ALL', label: 'সকল রেকর্ড' },
            { id: 'DAILY', label: 'আজকের দৈনিক রিপোর্ট' },
            { id: 'MONTHLY', label: 'চলতি মাসের রিপোর্ট' },
            { id: 'YEARLY', label: 'বার্ষিক রিপোর্ট (২০২৬)' },
            { id: 'CUSTOM', label: 'নির্ধারিত তারিখ সীমা' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setReportPeriod(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                reportPeriod === tab.id
                  ? 'bg-[#0f2942] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
          {reportPeriod === 'CUSTOM' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  শুরুর তারিখ
                </label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  শেষের তারিখ
                </label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              সম্পূর্ণ / অসম্পূর্ণ অবস্থা
            </label>
            <select
              value={completionFilter}
              onChange={(e) => setCompletionFilter(e.target.value as any)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">সকল (সম্পূর্ণ ও অসম্পূর্ণ)</option>
              <option value="COMPLETE">শুধুমাত্র সম্পূর্ণ</option>
              <option value="INCOMPLETE">শুধুমাত্র অসম্পূর্ণ</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              রেজি: নং বা মামলা নম্বর ফিল্টার
            </label>
            <input
              type="text"
              value={regOrCaseSearch}
              onChange={(e) => setRegOrCaseSearch(e.target.value)}
              placeholder="রেজি: নং বা মামলা নং লিখুন..."
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Printable Official Paper Register Sheet */}
      <div className="bg-white border border-slate-300 rounded-xl p-6 shadow-xs">
        <div className="text-center border-b-2 border-slate-800 pb-3 mb-4">
          <h1 className="text-lg font-bold text-slate-900">
            গণপ্রজাতন্ত্রী বাংলাদেশ সরকার
          </h1>
          <h2 className="text-base font-bold text-[#0f2942]">
            শহীদ সৈয়দ নজরুল ইসলাম মেডিকেল কলেজ হাসপাতাল, কিশোরগঞ্জ
          </h2>
          <p className="text-xs font-semibold text-slate-700 mt-0.5">
            জখমী রেজিস্টার প্রতিবেদন (১৩ কলামের দাপ্তরিক ছক) — মোট রেকর্ড:{' '}
            {toBengaliDigits(filteredRecords.length)} টি
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-slate-400 text-[11px] print-register-table">
            <thead>
              <tr className="bg-slate-100 text-slate-900 font-bold">
                <th className="border border-slate-400 p-1.5">১. রেজি: নং ও তারিখ</th>
                <th className="border border-slate-400 p-1.5">
                  ২. জখমীর নাম, বয়স, পিতার ও ঠিকানা
                </th>
                <th className="border border-slate-400 p-1.5">
                  ৩. চিকিৎসকের নাম/এন্ট্রি পাচ্ছি না
                </th>
                <th className="border border-slate-400 p-1.5">
                  ৪. অতিরিক্ত রেজি: নং ও তারিখ
                </th>
                <th className="border border-slate-400 p-1.5">
                  ৫. অত্র প্রতিষ্ঠানের স্মারক নম্বর ও তারিখ
                </th>
                <th className="border border-slate-400 p-1.5">
                  ৬. থানার মামলা নম্বর ও তারিখ/কোর্টের মামলা নম্বর ও তারিখ
                </th>
                <th className="border border-slate-400 p-1.5">৭. এমসি প্রেরণের তারিখ</th>
                <th className="border border-slate-400 p-1.5">
                  ৮. কি কি পরীক্ষা রিপোর্ট লাগবে
                </th>
                <th className="border border-slate-400 p-1.5">৯. সুপারিশকারী যদি থাকে</th>
                <th className="border border-slate-400 p-1.5">
                  ১০. আবেদনপত্র সংযুক্তি/অন্যান্য তথ্য সংযুক্তি
                </th>
                <th className="border border-slate-400 p-1.5">১১. এন্ট্রির খাতা সংযুক্তি</th>
                <th className="border border-slate-400 p-1.5">১২. মন্তব্য</th>
                <th className="border border-slate-400 p-1.5">১৩. সম্পূর্ণ/অসম্পূর্ণ</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((rec) => (
                <tr key={rec.id} className="align-top">
                  <td className="border border-slate-400 p-1.5 font-mono-tabular">
                    <div className="font-bold">{rec.registrationNo}</div>
                    <div>{formatDisplayDate(rec.registrationDate, false)}</div>
                  </td>
                  <td className="border border-slate-400 p-1.5">
                    <div className="font-bold">
                      {rec.injuredName} ({rec.injuredAge})
                    </div>
                    <div>পিতা: {rec.fatherOrGuardianName}</div>
                    <div>{rec.injuredAddress}</div>
                  </td>
                  <td className="border border-slate-400 p-1.5">
                    {rec.doctorEntryNotFound ? 'এন্ট্রি পাচ্ছি না' : rec.doctorName || '—'}
                  </td>
                  <td className="border border-slate-400 p-1.5 font-mono-tabular">
                    <div>{rec.additionalRegNo || '—'}</div>
                    <div>
                      {rec.additionalRegDate
                        ? formatDisplayDate(rec.additionalRegDate, false)
                        : ''}
                    </div>
                  </td>
                  <td className="border border-slate-400 p-1.5 font-mono-tabular">
                    <div>{rec.signatureNo || '—'}</div>
                    <div>
                      {rec.signatureDate ? formatDisplayDate(rec.signatureDate, false) : ''}
                    </div>
                  </td>
                  <td className="border border-slate-400 p-1.5">
                    <div>{rec.policeStationName}</div>
                    {rec.policeCaseNo && <div>মামলা নং: {rec.policeCaseNo}</div>}
                    {rec.policeCaseDate && (
                      <div>তারিখ: {formatDisplayDate(rec.policeCaseDate, true)}</div>
                    )}
                    {rec.courtCaseNo && <div>কোর্ট: {rec.courtCaseNo}</div>}
                  </td>
                  <td className="border border-slate-400 p-1.5 text-center font-mono-tabular">
                    {formatDisplayDate(rec.mcDispatchDate, true)}
                  </td>
                  <td className="border border-slate-400 p-1.5">
                    {rec.requiredTestReports || '—'}
                  </td>
                  <td className="border border-slate-400 p-1.5">
                    {rec.recommenderInfo || '—'}
                  </td>
                  <td className="border border-slate-400 p-1.5 text-center">
                    আবেদনপত্র / অন্যান্য তথ্য ({toBengaliDigits(rec.attachments?.length || 0)}টি)
                  </td>
                  <td className="border border-slate-400 p-1.5 text-center">এন্ট্রির খাতা</td>
                  <td className="border border-slate-400 p-1.5">{rec.remarks || '—'}</td>
                  <td className="border border-slate-400 p-1.5 text-center font-bold">
                    <div>{rec.completionStatus === 'COMPLETE' ? 'সম্পূর্ণ' : 'অসম্পূর্ণ'}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Official Signature Footer for Printed Register */}
        <div className="grid grid-cols-3 gap-8 pt-10 text-center text-xs text-slate-800">
          <div className="border-t border-slate-500 pt-1.5">
            ভারপ্রাপ্ত রেকর্ড কিপার / ডাটা এন্ট্রি অপারেটর
          </div>
          <div className="border-t border-slate-500 pt-1.5">
            আবাসিক মেডিকেল অফিসার (RMO)
          </div>
          <div className="border-t border-slate-500 pt-1.5">
            উপ-পরিচালক / পরিচালক (হাসপাতাল কর্তৃপক্ষ)
          </div>
        </div>
      </div>
    </div>
  );
};

