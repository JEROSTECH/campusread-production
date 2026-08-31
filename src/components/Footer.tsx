import React from 'react';
import { WebsiteSettings } from '../types';
import { Mail, Phone } from 'lucide-react';

interface FooterProps {
  settings?: WebsiteSettings;
  onOpenLecturerPortal: () => void;
  onOpenHowItWorks: () => void;
}

export const Footer: React.FC<FooterProps> = ({ settings, onOpenLecturerPortal, onOpenHowItWorks }) => {
  return (
    <footer id="main-footer" className="bg-white border-t border-slate-200 px-6 lg:px-10 py-5 shrink-0 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-6 text-[11px] font-bold uppercase tracking-widest text-slate-400">
        <span>&copy; {new Date().getFullYear()} CampusRead Platform</span>
        <button onClick={onOpenHowItWorks} className="hover:text-blue-700 transition-colors">
          Privacy Policy
        </button>
        <button onClick={onOpenHowItWorks} className="hover:text-blue-700 transition-colors">
          Terms of Service
        </button>
        <button onClick={onOpenLecturerPortal} className="hover:text-blue-700 transition-colors">
          Faculty Portal
        </button>
      </div>

      {(settings?.contactEmail || settings?.contactPhone) && (
        <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
          {settings?.contactEmail && (
            <a href={`mailto:${settings.contactEmail}`} className="flex items-center gap-1 hover:text-blue-700">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <span>{settings.contactEmail}</span>
            </a>
          )}
          {settings?.contactPhone && (
            <a href={`tel:${settings.contactPhone}`} className="flex items-center gap-1 hover:text-blue-700">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span>{settings.contactPhone}</span>
            </a>
          )}
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex -space-x-2">
          <div className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[8px] font-bold text-slate-700">
            UN
          </div>
          <div className="w-6 h-6 rounded-full bg-slate-300 border-2 border-white flex items-center justify-center text-[8px] font-bold text-slate-700">
            UI
          </div>
          <div className="w-6 h-6 rounded-full bg-slate-400 border-2 border-white flex items-center justify-center text-[8px] font-bold text-slate-100">
            OU
          </div>
          <div className="w-6 h-6 rounded-full bg-blue-700 border-2 border-white flex items-center justify-center text-[8px] font-bold text-white">
            CU
          </div>
        </div>
        <span className="text-xs font-medium text-slate-500 italic">
          Trusted by 50+ Partner Institutions
        </span>
      </div>
    </footer>
  );
};
