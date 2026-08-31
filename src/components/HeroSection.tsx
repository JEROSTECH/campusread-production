import React from 'react';
import { BookOpen, Sparkles, ShieldCheck, Award, ArrowRight, Smartphone, BookMarked, UserPlus } from 'lucide-react';
import { WebsiteSettings } from '../types';

interface HeroSectionProps {
  settings?: WebsiteSettings;
  onExploreBooks: () => void;
  onCreateStudentAccount: () => void;
  onBecomeAuthor: () => void;
  onJoinAffiliate: () => void;
  onOpenSampleReader: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  settings,
  onExploreBooks,
  onCreateStudentAccount,
  onBecomeAuthor,
  onJoinAffiliate,
  onOpenSampleReader,
}) => {
  return (
    <section className="relative bg-gradient-to-b from-blue-900 via-blue-950 to-slate-900 text-white overflow-hidden py-16 lg:py-20 px-6 lg:px-16 border-b border-blue-900">
      {/* Background Graphic Accents */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
        {/* Left Column: Headline & Action Buttons */}
        <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 bg-blue-800/60 border border-blue-700/80 px-3.5 py-1.5 rounded-full text-xs font-semibold text-blue-200 backdrop-blur-sm">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span>{settings?.heroBadge || 'Nigeria’s Premier Academic Digital Marketplace'}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight text-white font-serif">
            {settings?.heroTitle || (
              <>YOUR ACADEMIC LIBRARY, <span className="text-amber-400">ANYWHERE.</span></>
            )}
          </h1>

          <p className="text-base sm:text-lg text-slate-300 font-normal max-w-2xl leading-relaxed">
            {settings?.heroSubtitle || 'Access trusted academic books, course materials and past questions from lecturers and academic authors — online or offline.'}
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3.5 pt-2">
            <button
              onClick={onExploreBooks}
              className="px-6 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-lg shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 transform hover:-translate-y-0.5 uppercase tracking-wider"
            >
              <BookOpen className="w-4 h-4" />
              {settings?.heroCtaText || 'EXPLORE BOOKS'}
            </button>

            <button
              onClick={onCreateStudentAccount}
              className="px-6 py-3.5 bg-blue-700 hover:bg-blue-600 text-white font-extrabold text-xs sm:text-sm rounded-lg border border-blue-500 transition-all flex items-center gap-2 transform hover:-translate-y-0.5 shadow-md uppercase tracking-wider"
            >
              <UserPlus className="w-4 h-4 text-blue-200" />
              {settings?.secondaryCtaText || 'CREATE STUDENT ACCOUNT'}
            </button>

            <button
              onClick={onBecomeAuthor}
              className="px-5 py-3.5 bg-slate-800/90 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-lg border border-slate-700 transition-all flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              {settings?.authorCtaText || 'BECOME AN AUTHOR'}
            </button>
          </div>

          {/* Key Value Badges */}
          <div className="pt-6 grid grid-cols-3 gap-4 border-t border-blue-800/60 text-slate-300 text-xs font-medium">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Verified Coursework</span>
            </div>
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Protected Offline Reading</span>
            </div>
            <div className="flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>10-Yr Examination Solved Questions</span>
            </div>
          </div>
        </div>

        {/* Right Column: Book Preview Card & Digital Reader Promo */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-md w-full max-w-md space-y-5 transform lg:rotate-1 hover:rotate-0 transition-transform duration-300">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Campus Read Reader Engine</span>
              </div>
              <span className="text-[10px] bg-blue-900 text-blue-200 px-2 py-0.5 rounded font-bold">PDF Security</span>
            </div>

            <div className="bg-gradient-to-br from-indigo-950 to-blue-900 p-5 rounded-xl border border-indigo-800/50 space-y-3">
              <span className="bg-amber-400 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded uppercase">
                UNILAG / UI / OAU Approved
              </span>
              <h3 className="font-serif text-lg font-bold text-white">
                Advanced Fluid Mechanics for Engineering
              </h3>
              <p className="text-xs text-indigo-200">
                Prof. Adisa Adebayo • Faculty of Engineering
              </p>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-indigo-800/40">
                <span className="font-extrabold text-amber-300">₦4,500</span>
                <span className="text-slate-400">540 Pages • 2024 Edition</span>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex items-center justify-between">
                <span>Student Watermark:</span>
                <span className="text-emerald-400 font-bold">Active</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Offline Android Reading:</span>
                <span className="text-amber-400 font-bold">Supported</span>
              </div>
            </div>

            <button
              onClick={onOpenSampleReader}
              className="w-full py-3 bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <span>Test Interactive Protected Reader</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
