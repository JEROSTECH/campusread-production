import React, { useState, useEffect } from 'react';
import { X, Smartphone, Download, Apple, CheckCircle, Shield } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AppSettings } from '../types';

interface AppDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AppDownloadModal: React.FC<AppDownloadModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<AppSettings>({
    androidApkUrl: 'https://campusread.com.ng/download/campusread.apk',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.campusread.app',
    appStoreUrl: 'https://apps.apple.com/app/campus-read/id12345678',
    testFlightUrl: 'https://testflight.apple.com/join/campusread',
    showAppBanner: true,
    updatedAt: new Date().toISOString(),
  });

  useEffect(() => {
    async function loadSettings() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'appSettings'));
        if (snap.exists()) {
          setSettings(snap.data() as AppSettings);
        }
      } catch (err) {
        console.warn('App settings fetch warning:', err);
      }
    }
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-lg w-full p-6 lg:p-8 relative my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-md"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2 mb-6">
          <div className="w-12 h-12 bg-blue-900 text-white rounded-xl flex items-center justify-center mx-auto shadow-md">
            <Smartphone className="w-6 h-6 text-amber-400" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 font-serif tracking-tight">
            Get Campus Read Mobile App
          </h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
            Read your purchased university textbooks, lab manuals & past questions offline on Android and iOS devices.
          </p>
        </div>

        <div className="space-y-4">
          {/* Direct Android APK Download */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-emerald-700" />
                <span className="font-extrabold text-sm text-slate-900">Android Direct APK File</span>
              </div>
              <span className="bg-emerald-200 text-emerald-900 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">
                Direct Install
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Download the official Android APK directly for instant installation on any Android phone or tablet.
            </p>
            <a
              href={settings.androidApkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-lg shadow transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>DOWNLOAD ANDROID APK (v2.4)</span>
            </a>
          </div>

          {/* Google Play Store */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="font-extrabold text-xs text-slate-900 block">Google Play Store</span>
              <span className="text-[11px] text-slate-500">Official Android Market release</span>
            </div>
            <a
              href={settings.playStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors"
            >
              Get on Play Store
            </a>
          </div>

          {/* Apple iOS / TestFlight */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-xs text-slate-900">Apple iOS & iPadOS</span>
              <span className="text-[10px] bg-blue-100 text-blue-900 font-bold px-2 py-0.5 rounded">iPhone / iPad</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={settings.appStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 bg-blue-900 hover:bg-blue-950 text-white font-bold text-xs rounded-lg text-center transition-colors"
              >
                Apple App Store
              </a>
              <a
                href={settings.testFlightUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg text-center transition-colors"
              >
                Join TestFlight
              </a>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1 text-emerald-700 font-semibold">
            <Shield className="w-3.5 h-3.5" />
            Verified & Virus-Free Build
          </span>
          <span>Campus Read Mobile Platform</span>
        </div>
      </div>
    </div>
  );
};
