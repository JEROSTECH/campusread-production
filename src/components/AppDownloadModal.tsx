import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Download,
  Apple,
  CheckCircle,
  Shield,
  ArrowLeft,
  ExternalLink
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AppSettings } from '../types';

interface AppDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Platform = 'android' | 'ios' | null;

const isRealAppStoreUrl = (url?: string) =>
  !!url &&
  url.startsWith('https://apps.apple.com/') &&
  !url.includes('id12345678');

const isRealTestFlightUrl = (url?: string) =>
  !!url &&
  url.startsWith('https://testflight.apple.com/join/') &&
  !url.endsWith('/campusread');

export const AppDownloadModal: React.FC<AppDownloadModalProps> = ({
  isOpen,
  onClose
}) => {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>(null);

  const [settings, setSettings] = useState<AppSettings>({
    androidApkUrl:
      'https://campusread.com.ng/download/campusread.apk',
    playStoreUrl:
      'https://play.google.com/store/apps/details?id=com.campusread.app',
    appStoreUrl: '',
    testFlightUrl: '',
    showAppBanner: true,
    updatedAt: new Date().toISOString(),
  });

  useEffect(() => {
    async function loadSettings() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'appSettings'));

        if (snap.exists()) {
          setSettings(prev => ({
            ...prev,
            ...(snap.data() as Partial<AppSettings>)
          }));
        }
      } catch (err) {
        console.warn('App settings fetch warning:', err);
      }
    }

    if (isOpen) {
      setSelectedPlatform(null);
      loadSettings();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const appStoreAvailable = isRealAppStoreUrl(settings.appStoreUrl);
  const testFlightAvailable = isRealTestFlightUrl(settings.testFlightUrl);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-lg w-full p-6 lg:p-8 relative my-8">

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-md"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {selectedPlatform === null ? (
          <>
            <div className="text-center space-y-2 mb-7">
              <div className="w-12 h-12 bg-blue-900 text-white rounded-xl flex items-center justify-center mx-auto shadow-md">
                <Smartphone className="w-6 h-6 text-amber-400" />
              </div>

              <h2 className="text-2xl font-black text-slate-900 font-serif tracking-tight">
                Download CampusRead
              </h2>

              <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
                Select your device to get the appropriate CampusRead mobile app.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">

              {/* Android */}
              <button
                type="button"
                onClick={() => setSelectedPlatform('android')}
                className="group text-left bg-emerald-50 border-2 border-emerald-200 hover:border-emerald-500 hover:bg-emerald-100 rounded-2xl p-5 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-700 text-white flex items-center justify-center mb-4">
                  <Download className="w-6 h-6" />
                </div>

                <h3 className="font-black text-slate-900 text-base">
                  Android
                </h3>

                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Download and install the existing CampusRead APK directly.
                </p>

                <div className="mt-4 text-xs font-extrabold text-emerald-800">
                  CONTINUE →
                </div>
              </button>

              {/* iPhone / iPad */}
              <button
                type="button"
                onClick={() => setSelectedPlatform('ios')}
                className="group text-left bg-blue-50 border-2 border-blue-200 hover:border-blue-500 hover:bg-blue-100 rounded-2xl p-5 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-900 text-white flex items-center justify-center mb-4">
                  <Apple className="w-6 h-6" />
                </div>

                <h3 className="font-black text-slate-900 text-base">
                  iPhone / iPad
                </h3>

                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Get CampusRead through the Apple App Store or TestFlight.
                </p>

                <div className="mt-4 text-xs font-extrabold text-blue-900">
                  CONTINUE →
                </div>
              </button>

            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                <Shield className="w-3.5 h-3.5" />
                Verified CampusRead App
              </span>

              <span>Campus Read Mobile Platform</span>
            </div>
          </>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <button
                type="button"
                onClick={() => setSelectedPlatform(null)}
                className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {selectedPlatform === 'android'
                    ? 'Android App'
                    : 'iPhone / iPad App'}
                </h2>

                <p className="text-xs text-slate-500">
                  Choose your installation method.
                </p>
              </div>
            </div>

            {selectedPlatform === 'android' ? (
              <div className="space-y-4">

                {/* Existing APK */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Download className="w-5 h-5 text-emerald-700" />
                    <span className="font-extrabold text-sm text-slate-900">
                      Android Direct APK
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mb-4">
                    Install the official CampusRead APK directly on your Android phone or tablet.
                  </p>

                  <a
                    href={settings.androidApkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-lg shadow transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    DOWNLOAD ANDROID APK
                  </a>
                </div>

                {/* Play Store */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="font-extrabold text-xs text-slate-900 block">
                        Google Play Store
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Official Android market release
                      </span>
                    </div>

                    <a
                      href={settings.playStoreUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      Get App
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

              </div>
            ) : (
              <div className="space-y-4">

                {/* App Store */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Apple className="w-5 h-5 text-blue-900" />
                    <span className="font-extrabold text-sm text-slate-900">
                      Apple App Store
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mb-4">
                    Install the official CampusRead iPhone and iPad app from Apple.
                  </p>

                  {appStoreAvailable ? (
                    <a
                      href={settings.appStoreUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 bg-blue-900 hover:bg-blue-950 text-white font-extrabold text-xs rounded-lg shadow transition-colors flex items-center justify-center gap-2"
                    >
                      <Apple className="w-4 h-4" />
                      DOWNLOAD FROM APP STORE
                    </a>
                  ) : (
                    <div className="w-full py-3 bg-slate-200 text-slate-500 font-extrabold text-xs rounded-lg text-center">
                      APP STORE LINK NOT YET AVAILABLE
                    </div>
                  )}
                </div>

                {/* TestFlight */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-slate-700" />
                    <span className="font-extrabold text-sm text-slate-900">
                      TestFlight
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mb-4">
                    Use TestFlight when the CampusRead beta build is available for testing.
                  </p>

                  {testFlightAvailable ? (
                    <a
                      href={settings.testFlightUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs rounded-lg shadow transition-colors flex items-center justify-center gap-2"
                    >
                      JOIN CAMPUSREAD TESTFLIGHT
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  ) : (
                    <div className="w-full py-3 bg-slate-200 text-slate-500 font-extrabold text-xs rounded-lg text-center">
                      TESTFLIGHT LINK NOT YET AVAILABLE
                    </div>
                  )}
                </div>

              </div>
            )}

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                <Shield className="w-3.5 h-3.5" />
                Verified CampusRead App
              </span>

              <span>Campus Read Mobile Platform</span>
            </div>
          </>
        )}

      </div>
    </div>
  );
};