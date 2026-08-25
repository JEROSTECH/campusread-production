import React from 'react';
import { X, Building2, BookCheck, ShieldCheck, Download, Smartphone, CheckCircle2, HelpCircle } from 'lucide-react';
import { WebsiteSettings } from '../types';

interface HowItWorksModalProps {
  settings?: WebsiteSettings;
  onClose: () => void;
  onBrowse: () => void;
}

export const HowItWorksModal: React.FC<HowItWorksModalProps> = ({ settings, onClose, onBrowse }) => {
  const defaultFaqs = [
    {
      id: 'faq-1',
      question: 'How do students access textbooks offline?',
      answer: 'Once purchased, books are cached inside the secure CampusRead E-Reader app on Android or web. Encrypted reading works seamlessly without continuous internet access.'
    },
    {
      id: 'faq-2',
      question: 'How do lecturers receive their royalties?',
      answer: 'Lecturers earn 80% direct royalty on every sale. Payouts can be requested at any time to any verified Nigerian bank account and are disbursed directly.'
    },
    {
      id: 'faq-3',
      question: 'Are copyright materials protected?',
      answer: 'Yes. Materials are protected by zero-trust DRM, dynamic watermark stamps embedding student matric/email & IP data, and screenshot blocking.'
    }
  ];

  const faqs = settings?.faqs && settings.faqs.length > 0 ? settings.faqs : defaultFaqs;

  return (
    <div id="how-it-works-modal-overlay" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div id="how-it-works-modal-container" className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-700 text-white font-black text-sm rounded flex items-center justify-center">
              CR
            </div>
            <h2 className="font-bold text-lg text-slate-900">How CampusRead Works & FAQs</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-8">
          <div className="text-center max-w-lg mx-auto space-y-2">
            <h3 className="text-2xl font-extrabold text-slate-900 leading-snug">
              Bridging University Lecturers & Students with Authorized Digital Materials
            </h3>
            <p className="text-sm text-slate-600">
              CampusRead eliminates textbook piracy, paper shortages, and inflated costs by connecting students directly to verified faculty publications.
            </p>
          </div>

          {/* 3 Step Process Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3 relative">
              <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 font-black text-base flex items-center justify-center">
                1
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Select Your University</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Filter by your institution (UNILAG, UI, OAU, CU, UNN) to automatically match syllabus requirements for your registered courses.
              </p>
            </div>

            <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3 relative">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 font-black text-base flex items-center justify-center">
                2
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Purchase DRM License</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Pay using student bank transfer or card. Instant activation with fair lecturer royalty share and zero intermediary markups.
              </p>
            </div>

            <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3 relative">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 font-black text-base flex items-center justify-center">
                3
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Read Offline Anywhere</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Open in the CampusRead E-Reader app on web or mobile. Annotate, highlight, search, and study without needing active data.
              </p>
            </div>
          </div>

          {/* Frequently Asked Questions */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <HelpCircle className="w-5 h-5 text-blue-700" />
              <h4 className="font-bold text-slate-900 text-base">Frequently Asked Questions</h4>
            </div>

            <div className="space-y-3">
              {faqs.map((faq) => (
                <div key={faq.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <h5 className="font-bold text-slate-900 text-xs sm:text-sm">{faq.question}</h5>
                  <p className="text-xs text-slate-600 leading-relaxed">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Institutional Security Highlights */}
          <div className="p-5 bg-blue-50 rounded-xl border border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-blue-700 shrink-0" />
              <div>
                <h5 className="font-bold text-slate-900 text-sm">Authorized Academic Protection</h5>
                <p className="text-xs text-slate-600">All materials carry encrypted student watermarks to guarantee copyright integrity.</p>
              </div>
            </div>
            <button
              onClick={() => {
                onClose();
                onBrowse();
              }}
              className="px-5 py-2.5 bg-blue-700 text-white font-bold text-xs rounded-lg shadow hover:bg-blue-800 transition-colors shrink-0"
            >
              Explore Textbooks
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
