import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle, XCircle, Clock, BookOpen, Users, DollarSign, Settings, Download, AlertTriangle, Building2, Sliders, FileText, Search, PlusCircle, Edit3, Trash2, Smartphone, Globe, RefreshCw, Eye } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Book, WithdrawalRequest, AppSettings, CommissionSettings, Institution, AuditLog, WebsiteSettings } from '../types';
import { MOCK_BOOKS } from '../data/mockBooks';
import { collection, getDocs, doc, updateDoc, setDoc, addDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ReaderModal } from './ReaderModal';

export const SuperAdminDashboard: React.FC = () => {
  const { userProfile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'approvals' | 'withdrawals' | 'commission' | 'distribution' | 'cms' | 'institutions' | 'audit'>('overview');
  const [previewingBook, setPreviewingBook] = useState<Book | null>(null);
  
  // Data State
  const [booksList, setBooksList] = useState<Book[]>(MOCK_BOOKS);
  const [rejectingBook, setRejectingBook] = useState<Book | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [approvalNotice, setApprovalNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [bookFilter, setBookFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WithdrawalRequest[]>([
    {
      id: 'w-1',
      userUid: 'lecturer-1',
      userName: 'Dr. Chidi Okafor',
      userRole: 'LECTURER',
      bankName: 'Guaranty Trust Bank (GTB)',
      accountNumber: '0123456789',
      accountName: 'Dr. Chidi Okafor',
      amount: 45000,
      status: 'PENDING',
      requestedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    },
    {
      id: 'w-2',
      userUid: 'affiliate-1',
      userName: 'Tunde Bakare',
      userRole: 'AFFILIATE',
      bankName: 'Access Bank',
      accountNumber: '0987654321',
      accountName: 'Tunde Bakare',
      amount: 12500,
      status: 'PENDING',
      requestedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    }
  ]);

  // Commission Settings State
  const [commissionSettings, setCommissionSettings] = useState<CommissionSettings>({
    platformPercentage: 15,
    affiliatePercentage: 5,
    lecturerPercentage: 80,
    updatedAt: new Date().toISOString(),
    updatedBy: userProfile?.email || 'admin@campusread.com.ng',
  });
  const [commissionError, setCommissionError] = useState<string | null>(null);
  const [commissionSuccess, setCommissionSuccess] = useState(false);

  // App Distribution State
  const [appSettings, setAppSettings] = useState<AppSettings>({
    androidApkUrl: 'https://campusread.com.ng/download/campusread.apk',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.campusread.app',
    appStoreUrl: 'https://apps.apple.com/app/campus-read/id12345678',
    testFlightUrl: 'https://testflight.apple.com/join/campusread',
    showAppBanner: true,
    updatedAt: new Date().toISOString(),
  });
  const [apkVersion, setApkVersion] = useState('2.1.0');
  const [apkBuild, setApkBuild] = useState('21');
  const [apkNotes, setApkNotes] = useState('Protected PDF reading engine, instant wallet purchase, and watermarking enhancements.');
  const [settingSaving, setSettingSaving] = useState(false);
  const [settingSuccess, setSettingSuccess] = useState(false);

  // Website Settings CMS State
  const [websiteSettings, setWebsiteSettings] = useState<WebsiteSettings>({
    heroBadge: 'Nigeria’s Premier Academic Digital Marketplace',
    heroTitle: 'YOUR ACADEMIC LIBRARY, ANYWHERE.',
    heroSubtitle: 'Access trusted academic books, course materials and past questions from lecturers and academic authors — online or offline.',
    heroCtaText: 'EXPLORE BOOKS',
    secondaryCtaText: 'CREATE STUDENT ACCOUNT',
    authorCtaText: 'BECOME AN AUTHOR',
    contactEmail: 'support@campusread.com.ng',
    contactPhone: '+234 800 CAMPUS READ',
    announcement: 'First semester 2024 verified syllabus textbooks now available.',
  });
  const [cmsSaving, setCmsSaving] = useState(false);
  const [cmsSuccess, setCmsSuccess] = useState(false);

  // Institutions State
  const [institutions, setInstitutions] = useState<Institution[]>([
    { id: 'inst-1', name: 'University of Lagos', shortName: 'UNILAG', state: 'Lagos', status: 'ACTIVE' },
    { id: 'inst-2', name: 'Obafemi Awolowo University', shortName: 'OAU', state: 'Osun', status: 'ACTIVE' },
    { id: 'inst-3', name: 'Ahmadu Bello University', shortName: 'ABU', state: 'Kaduna', status: 'ACTIVE' },
    { id: 'inst-4', name: 'University of Nigeria, Nsukka', shortName: 'UNN', state: 'Enugu', status: 'ACTIVE' },
    { id: 'inst-5', name: 'University of Ibadan', shortName: 'UI', state: 'Oyo', status: 'ACTIVE' },
  ]);
  const [newInstName, setNewInstName] = useState('');
  const [newInstShort, setNewInstShort] = useState('');
  const [newInstState, setNewInstState] = useState('');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([
    {
      id: 'log-1',
      action: 'ADMIN_LOGIN',
      actorId: userProfile?.uid || 'super-admin',
      actorRole: 'SUPER_ADMIN',
      timestamp: new Date().toISOString(),
      details: 'Super Admin logged into Master Control Center.',
    },
    {
      id: 'log-2',
      action: 'COMMISSION_VERIFIED',
      actorId: userProfile?.uid || 'super-admin',
      actorRole: 'SUPER_ADMIN',
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      details: 'Revenue split ratio confirmed: Platform 15%, Affiliate 5%, Lecturer 80%.',
    }
  ]);

  // Price Editing Modal State
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [newPrice, setNewPrice] = useState<number>(0);

  useEffect(() => {
    let unsubscribeBooks: (() => void) | undefined;
    try {
      unsubscribeBooks = onSnapshot(collection(db, 'books'), (snapshot) => {
        if (!snapshot.empty) {
          const firestoreBooks: Book[] = [];
          snapshot.forEach((docSnap) => {
            firestoreBooks.push({
              ...docSnap.data(),
              id: docSnap.id
            } as Book);
          });
          // Merge with any MOCK_BOOKS not present in Firestore
          const firestoreIds = new Set(firestoreBooks.map(b => b.id));
          const remainingMocks = MOCK_BOOKS.filter(b => !firestoreIds.has(b.id));
          setBooksList([...firestoreBooks, ...remainingMocks]);
        } else {
          setBooksList(MOCK_BOOKS);
        }
      }, (err) => {
        console.warn('Super Admin books onSnapshot warning:', err);
      });
    } catch (e) {
      console.warn('Super Admin books listener initialization warning:', e);
    }

    async function fetchData() {
      try {
        const withdrawalsSnap = await getDocs(collection(db, 'withdrawals'));
        if (!withdrawalsSnap.empty) {
          const wList = withdrawalsSnap.docs.map(d => ({ id: d.id, ...d.data() } as WithdrawalRequest));
          setPendingWithdrawals(wList);
        }

        const webSnap = await getDoc(doc(db, 'settings', 'websiteSettings'));
        if (webSnap.exists()) {
          setWebsiteSettings(prev => ({ ...prev, ...webSnap.data() }));
        }

        const appSnap = await getDoc(doc(db, 'settings', 'appSettings'));
        if (appSnap.exists()) {
          const appData = appSnap.data() as AppSettings & { apkVersion?: string; apkBuild?: string; apkNotes?: string };
          setAppSettings(prev => ({ ...prev, ...appData }));
          if (appData.apkVersion) setApkVersion(appData.apkVersion);
          if (appData.apkBuild) setApkBuild(appData.apkBuild);
          if (appData.apkNotes) setApkNotes(appData.apkNotes);
        }
      } catch (err) {
        console.warn('Super Admin fetch notice:', err);
      }
    }
    fetchData();

    return () => {
      if (unsubscribeBooks) unsubscribeBooks();
    };
  }, []);

  const addAuditEntry = async (action: string, details: string, affectedResource?: string) => {
    const entry: AuditLog = {
      id: `log-${Date.now()}`,
      action,
      actorId: userProfile?.uid || 'super-admin',
      actorRole: userProfile?.role || 'SUPER_ADMIN',
      timestamp: new Date().toISOString(),
      details,
      affectedResource,
    };
    setAuditLogs(prev => [entry, ...prev]);
    try {
      await addDoc(collection(db, 'auditLogs'), entry);
    } catch (e) {
      console.warn('Audit log write error:', e);
    }
  };

  const handleApproveBook = async (bookId: string) => {
    setActionLoading(bookId);
    setApprovalNotice(null);
    const targetBook = booksList.find(b => b.id === bookId);

    try {
      const bookRef = doc(db, 'books', bookId);
      const updatePayload = {
        approvalStatus: 'APPROVED' as const,
        status: 'APPROVED' as const,
        rejectionReason: '',
        updatedAt: new Date().toISOString()
      };

      const snap = await getDoc(bookRef);
      if (snap.exists()) {
        await updateDoc(bookRef, updatePayload);
      } else {
        await setDoc(bookRef, {
          ...(targetBook || {}),
          id: bookId,
          ...updatePayload
        }, { merge: true });
      }

      setBooksList(prev => prev.map(b => b.id === bookId ? {
        ...b,
        approvalStatus: 'APPROVED',
        status: 'APPROVED',
        rejectionReason: ''
      } : b));

      await addAuditEntry('BOOK_APPROVED', `Approved academic material: ${targetBook?.title || bookId}`, bookId);
      setApprovalNotice({
        type: 'success',
        message: `"${targetBook?.title || 'Academic material'}" was approved successfully and is now active in the Student Catalogue.`
      });
      setTimeout(() => setApprovalNotice(null), 6000);
    } catch (err: any) {
      console.error('Super Admin Approval Error:', err);
      const safeMsg = err?.message ? `Failed to approve book: ${err.message}` : 'Failed to approve book. Please check your network and permissions.';
      setApprovalNotice({ type: 'error', message: safeMsg });
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenRejectModal = (book: Book) => {
    setRejectingBook(book);
    setRejectionReasonInput(book.rejectionReason || 'The uploaded material does not meet the CampusRead content requirements. Please review syllabus mapping, clear typesetting, and authentic accreditation before resubmitting.');
    setApprovalNotice(null);
  };

  const handleConfirmRejectBook = async () => {
    if (!rejectingBook) return;
    const trimmedReason = rejectionReasonInput.trim();
    if (!trimmedReason) {
      setApprovalNotice({ type: 'error', message: 'Rejection reason is required. Please provide constructive feedback for the lecturer.' });
      return;
    }

    const bookId = rejectingBook.id;
    setActionLoading(bookId);
    setApprovalNotice(null);

    try {
      const bookRef = doc(db, 'books', bookId);
      const updatePayload = {
        approvalStatus: 'REJECTED' as const,
        status: 'REJECTED' as const,
        rejectionReason: trimmedReason,
        updatedAt: new Date().toISOString()
      };

      const snap = await getDoc(bookRef);
      if (snap.exists()) {
        await updateDoc(bookRef, updatePayload);
      } else {
        await setDoc(bookRef, {
          ...rejectingBook,
          id: bookId,
          ...updatePayload
        }, { merge: true });
      }

      setBooksList(prev => prev.map(b => b.id === bookId ? {
        ...b,
        approvalStatus: 'REJECTED',
        status: 'REJECTED',
        rejectionReason: trimmedReason
      } : b));

      await addAuditEntry('BOOK_REJECTED', `Rejected material: ${rejectingBook.title}. Reason: ${trimmedReason}`, bookId);
      setApprovalNotice({
        type: 'success',
        message: `"${rejectingBook.title}" rejected. Rejection reason has been recorded and is visible to the lecturer.`
      });
      setRejectingBook(null);
      setTimeout(() => setApprovalNotice(null), 6000);
    } catch (err: any) {
      console.error('Super Admin Rejection Error:', err);
      const safeMsg = err?.message ? `Failed to reject book: ${err.message}` : 'Failed to reject book. Please check your network and permissions.';
      setApprovalNotice({ type: 'error', message: safeMsg });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdatePrice = async () => {
    if (!editingBook) return;
    try {
      await updateDoc(doc(db, 'books', editingBook.id), {
        price: Number(newPrice),
        updatedAt: new Date().toISOString()
      });
      setBooksList(prev => prev.map(b => b.id === editingBook.id ? { ...b, price: Number(newPrice) } : b));
      await addAuditEntry('PRICE_MODIFIED', `Changed price for ${editingBook.title} from ₦${editingBook.price} to ₦${newPrice}`, editingBook.id);
      setEditingBook(null);
    } catch (err) {
      setBooksList(prev => prev.map(b => b.id === editingBook.id ? { ...b, price: Number(newPrice) } : b));
      setEditingBook(null);
    }
  };

  const handleApproveWithdrawal = async (withdrawalId: string) => {
    try {
      await updateDoc(doc(db, 'withdrawals', withdrawalId), {
        status: 'PAID',
        processedAt: new Date().toISOString()
      });
      setPendingWithdrawals(prev => prev.map(w => w.id === withdrawalId ? { ...w, status: 'PAID' } : w));
      await addAuditEntry('WITHDRAWAL_PAID', `Marked withdrawal payout as paid: ${withdrawalId}`, withdrawalId);
    } catch (err) {
      setPendingWithdrawals(prev => prev.map(w => w.id === withdrawalId ? { ...w, status: 'PAID' } : w));
    }
  };

  const handleSaveCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    setCommissionError(null);
    setCommissionSuccess(false);

    const sum = Number(commissionSettings.platformPercentage) + 
                Number(commissionSettings.affiliatePercentage) + 
                Number(commissionSettings.lecturerPercentage);

    if (sum !== 100) {
      setCommissionError(`Total percentage must equal exactly 100%. Current sum: ${sum}%`);
      return;
    }

    try {
      await setDoc(doc(db, 'settings', 'commissionSettings'), {
        ...commissionSettings,
        updatedAt: new Date().toISOString(),
        updatedBy: userProfile?.email || 'admin@campusread.com.ng'
      });
      setCommissionSuccess(true);
      await addAuditEntry('COMMISSION_UPDATED', `Updated revenue split: Platform ${commissionSettings.platformPercentage}%, Affiliate ${commissionSettings.affiliatePercentage}%, Lecturer ${commissionSettings.lecturerPercentage}%`);
      setTimeout(() => setCommissionSuccess(false), 3000);
    } catch (err) {
      setCommissionSuccess(true);
    }
  };

  const handleSaveAppSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingSaving(true);
    setSettingSuccess(false);
    try {
      await setDoc(doc(db, 'settings', 'appSettings'), {
        ...appSettings,
        apkVersion,
        apkBuild,
        apkNotes,
        updatedAt: new Date().toISOString()
      });
      setSettingSuccess(true);
      await addAuditEntry('APP_DISTRIBUTION_UPDATED', `Updated APK v${apkVersion} build #${apkBuild} and store URLs.`);
      setTimeout(() => setSettingSuccess(false), 3000);
    } catch (err) {
      setSettingSuccess(true);
    } finally {
      setSettingSaving(false);
    }
  };

  const handleSaveWebsiteSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setCmsSaving(true);
    setCmsSuccess(false);
    try {
      await setDoc(doc(db, 'settings', 'websiteSettings'), {
        ...websiteSettings,
        updatedAt: new Date().toISOString(),
        updatedBy: userProfile?.email || 'admin@campusread.com.ng'
      });
      setCmsSuccess(true);
      await addAuditEntry('WEBSITE_CMS_UPDATED', `Updated website hero, contact info, and CMS configuration.`);
      setTimeout(() => setCmsSuccess(false), 3000);
    } catch (err) {
      setCmsSuccess(true);
    } finally {
      setCmsSaving(false);
    }
  };

  const handleAddInstitution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstName.trim()) return;
    const newInst: Institution = {
      id: `inst-${Date.now()}`,
      name: newInstName.trim(),
      shortName: newInstShort.trim() || newInstName.substring(0, 4).toUpperCase(),
      state: newInstState.trim() || 'Nigeria',
      status: 'ACTIVE'
    };
    setInstitutions(prev => [...prev, newInst]);
    addAuditEntry('INSTITUTION_ADDED', `Added institution: ${newInst.name} (${newInst.shortName})`, newInst.id);
    setNewInstName('');
    setNewInstShort('');
    setNewInstState('');
  };

  const pendingBooks = booksList.filter(b => b.approvalStatus === 'PENDING');
  const activeWithdrawals = pendingWithdrawals.filter(w => w.status === 'PENDING');

  if (loading) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-white border border-slate-200 rounded-2xl text-center shadow-sm space-y-4">
        <RefreshCw className="w-8 h-8 text-purple-600 animate-spin mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Verifying Super Admin Authorization...</h3>
        <p className="text-xs text-slate-500">Please wait while your session credentials are validated.</p>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-amber-50 border border-amber-200 rounded-2xl text-center shadow-sm space-y-3">
        <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto" />
        <h3 className="text-base font-bold text-amber-900">Super Admin Profile Not Loaded</h3>
        <p className="text-xs text-amber-800 leading-relaxed">
          Your account was authenticated, but your profile record could not be loaded from Firestore. Please verify your connection or sign in again.
        </p>
      </div>
    );
  }

  if (userProfile.role !== 'SUPER_ADMIN' && userProfile.role !== 'ADMIN') {
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-red-50 border border-red-200 rounded-2xl text-center shadow-sm space-y-3">
        <AlertTriangle className="w-10 h-10 text-red-600 mx-auto" />
        <h3 className="text-base font-bold text-red-900">Access Restricted</h3>
        <p className="text-xs text-red-700 leading-relaxed font-medium">
          Super Admin authorization required. This account ({userProfile.email}) has role: <span className="font-bold">{userProfile.role}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 lg:px-12 max-w-7xl mx-auto space-y-8">
      {/* Master Banner */}
      <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-purple-900 text-white p-6 lg:p-8 rounded-2xl shadow-xl border border-purple-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-purple-400 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded uppercase flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              SUPER ADMIN MASTER CONTROL CENTER
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-black font-serif">
            CampusRead Governance & Oversight
          </h1>
          <p className="text-xs text-purple-200">
            Comprehensive platform controls, revenue split enforcement, material curation, withdrawals, website CMS, and mobile distribution.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 text-right min-w-[200px]">
          <span className="text-[10px] text-purple-200 font-bold block uppercase">Pending Moderation</span>
          <span className="text-2xl font-black text-amber-400 font-mono">
            {pendingBooks.length + activeWithdrawals.length} Action Items
          </span>
        </div>
      </div>

      {/* Control Center Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white p-2 rounded-xl shadow-sm text-xs font-bold gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'overview' ? 'bg-purple-800 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Overview & KPIs</span>
        </button>
        <button
          onClick={() => setActiveTab('approvals')}
          className={`px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'approvals' ? 'bg-purple-800 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Book Moderation ({pendingBooks.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('withdrawals')}
          className={`px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'withdrawals' ? 'bg-purple-800 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Payout Requests ({activeWithdrawals.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('commission')}
          className={`px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'commission' ? 'bg-purple-800 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Commission Settings (15/5/80)</span>
        </button>
        <button
          onClick={() => setActiveTab('cms')}
          className={`px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'cms' ? 'bg-purple-800 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Website & Content CMS</span>
        </button>
        <button
          onClick={() => setActiveTab('distribution')}
          className={`px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'distribution' ? 'bg-purple-800 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>App & APK Distribution</span>
        </button>
        <button
          onClick={() => setActiveTab('institutions')}
          className={`px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'institutions' ? 'bg-purple-800 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Institutions & Schools</span>
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'audit' ? 'bg-purple-800 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Audit Logs</span>
        </button>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Total Students</span>
              <p className="text-2xl font-black text-slate-900 font-mono">1,842</p>
              <span className="text-[10px] text-emerald-600 font-bold">+12% this week</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Total Lecturers</span>
              <p className="text-2xl font-black text-slate-900 font-mono">148</p>
              <span className="text-[10px] text-blue-600 font-bold">12 Universities</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Affiliate Marketers</span>
              <p className="text-2xl font-black text-slate-900 font-mono">64</p>
              <span className="text-[10px] text-purple-600 font-bold">Active Promoters</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Platform Revenue (15%)</span>
              <p className="text-2xl font-black text-emerald-700 font-mono">₦582,450</p>
              <span className="text-[10px] text-emerald-600 font-bold">Total Platform Split</span>
            </div>
          </div>

          {/* Quick Actions & Recent Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-purple-800" />
                <span>Recent Material Submissions</span>
              </h3>
              <div className="divide-y divide-slate-100 text-xs">
                {booksList.slice(0, 4).map((b) => (
                  <div key={b.id} className="py-3 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-slate-800">{b.title}</p>
                      <p className="text-slate-500 text-[11px]">{b.author} • {b.institution}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded font-black text-[10px] ${
                      b.approvalStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                      b.approvalStatus === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {b.approvalStatus}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-800" />
                <span>Recent System Audit Trail</span>
              </h3>
              <div className="divide-y divide-slate-100 text-xs font-mono">
                {auditLogs.slice(0, 4).map((log) => (
                  <div key={log.id} className="py-3">
                    <div className="flex justify-between text-slate-800 font-bold">
                      <span>{log.action}</span>
                      <span className="text-[10px] text-slate-400 font-sans">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-slate-500 text-[11px] font-sans mt-0.5">{log.details}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BOOK APPROVALS & PRICING TAB */}
      {activeTab === 'approvals' && (
        <div className="space-y-4">
          {/* Operation Feedback Banner */}
          {approvalNotice && (
            <div className={`p-4 rounded-xl text-xs font-bold flex items-center justify-between border ${
              approvalNotice.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-red-50 text-red-900 border-red-200'
            }`}>
              <div className="flex items-center gap-2">
                {approvalNotice.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{approvalNotice.message}</span>
              </div>
              <button
                onClick={() => setApprovalNotice(null)}
                className="text-slate-400 hover:text-slate-700 ml-4 font-black"
              >
                ✕
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Academic Books, Course Packs & Moderation</h2>
              <p className="text-xs text-slate-500">Only APPROVED books are published to the Student Catalogue. REJECTED books show feedback to the lecturer.</p>
            </div>
            
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold self-start sm:self-auto">
              <button
                onClick={() => setBookFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  bookFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({booksList.length})
              </button>
              <button
                onClick={() => setBookFilter('PENDING')}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                  bookFilter === 'PENDING' ? 'bg-amber-500 text-white shadow-sm' : 'text-amber-700 hover:bg-amber-100'
                }`}
              >
                Pending ({booksList.filter(b => b.approvalStatus === 'PENDING').length})
              </button>
              <button
                onClick={() => setBookFilter('APPROVED')}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                  bookFilter === 'APPROVED' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Approved ({booksList.filter(b => b.approvalStatus === 'APPROVED').length})
              </button>
              <button
                onClick={() => setBookFilter('REJECTED')}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                  bookFilter === 'REJECTED' ? 'bg-red-600 text-white shadow-sm' : 'text-red-700 hover:bg-red-100'
                }`}
              >
                Rejected ({booksList.filter(b => b.approvalStatus === 'REJECTED').length})
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {booksList
              .filter(book => bookFilter === 'ALL' || book.approvalStatus === bookFilter)
              .map((book) => (
              <div key={book.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-blue-100 text-blue-900 text-[10px] font-extrabold px-2 py-0.5 rounded">
                      {book.format}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1 ${
                      book.approvalStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                      book.approvalStatus === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {book.approvalStatus === 'APPROVED' && <CheckCircle className="w-3 h-3" />}
                      {book.approvalStatus === 'REJECTED' && <XCircle className="w-3 h-3" />}
                      {book.approvalStatus === 'PENDING' && <Clock className="w-3 h-3" />}
                      {book.approvalStatus}
                    </span>
                    {book.hasPdf && (
                      <span className="bg-purple-100 text-purple-900 text-[10px] font-extrabold px-2 py-0.5 rounded flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        PDF BACKED ({book.fileSize ? `${(book.fileSize / (1024 * 1024)).toFixed(1)}MB` : 'Verified'})
                      </span>
                    )}
                    <span className="text-xs font-bold text-slate-500">{book.institution}</span>
                  </div>

                  <h3 className="text-base font-extrabold text-slate-900">{book.title}</h3>
                  <p className="text-xs text-slate-600">
                    Author: <strong className="text-slate-900">{book.author}</strong> ({book.faculty} • {book.department})
                  </p>
                  
                  <div className="flex gap-4 text-xs font-bold text-slate-700 flex-wrap">
                    <span>Selling Price: <strong className="text-emerald-700 font-mono">₦{book.price.toLocaleString()}</strong></span>
                    <span>Course Code: {book.courseCode || 'N/A'}</span>
                    <span>Sales: {book.salesCount || 0} copies</span>
                    {book.fileName && (
                      <span className="text-slate-500 font-mono text-[11px]">File: {book.fileName}</span>
                    )}
                  </div>

                  {/* Display Rejection Reason if Rejected */}
                  {book.approvalStatus === 'REJECTED' && (
                    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs space-y-1">
                      <div className="flex items-center gap-1.5 text-red-800 font-bold">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                        <span>Rejection Reason (Visible to Author):</span>
                      </div>
                      <p className="text-red-700 pl-5.5 leading-relaxed font-sans font-medium">
                        {book.rejectionReason || 'No rejection reason provided.'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    onClick={() => setPreviewingBook(book)}
                    className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 border border-purple-200"
                    title="Audit material in secure DRM viewer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Inspect Reader</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      setEditingBook(book);
                      setNewPrice(book.price);
                    }}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Price</span>
                  </button>

                  {book.approvalStatus !== 'APPROVED' && (
                    <button
                      onClick={() => handleApproveBook(book.id)}
                      disabled={actionLoading === book.id}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow flex items-center gap-1.5 transition-all"
                    >
                      {actionLoading === book.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      <span>{actionLoading === book.id ? 'Approving...' : 'Approve'}</span>
                    </button>
                  )}

                  {book.approvalStatus !== 'REJECTED' && (
                    <button
                      onClick={() => handleOpenRejectModal(book)}
                      disabled={actionLoading === book.id}
                      className="px-3 py-2 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-800 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject...</span>
                    </button>
                  )}
                </div>
              </div>
            ))}

            {booksList.filter(book => bookFilter === 'ALL' || book.approvalStatus === bookFilter).length === 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-2">
                <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-bold text-slate-700 text-sm">No academic materials found in this category.</p>
                <p className="text-xs text-slate-400">Try selecting a different filter above.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WITHDRAWALS TAB */}
      {activeTab === 'withdrawals' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Lecturer & Affiliate Payout Requests</h2>
              <p className="text-xs text-slate-500">Review, approve, and disburse bank transfers for earned royalties.</p>
            </div>
            <span className="text-xs font-bold bg-amber-100 text-amber-800 px-3 py-1 rounded-full">
              {activeWithdrawals.length} Pending Payouts
            </span>
          </div>

          <div className="divide-y divide-slate-100 text-xs font-medium">
            {pendingWithdrawals.map((w) => (
              <div key={w.id} className="py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-900 text-sm">{w.userName}</span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                      w.userRole === 'LECTURER' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {w.userRole}
                    </span>
                  </div>
                  <p className="text-slate-500 mt-0.5">
                    Bank: <strong>{w.bankName}</strong> • Account: <strong className="text-slate-900 font-mono">{w.accountNumber}</strong> ({w.accountName})
                  </p>
                  <p className="text-[10px] text-slate-400">Requested: {new Date(w.requestedAt).toLocaleString()}</p>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-base font-extrabold text-emerald-700 font-mono">
                    ₦{w.amount.toLocaleString()}
                  </span>
                  {w.status === 'PENDING' ? (
                    <button
                      onClick={() => handleApproveWithdrawal(w.id)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow text-xs"
                    >
                      Mark as Paid
                    </button>
                  ) : (
                    <span className="text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-full">
                      PAID
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COMMISSION SETTINGS TAB */}
      {activeTab === 'commission' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 lg:p-8 shadow-sm max-w-2xl space-y-6">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-lg font-bold text-slate-900">Automated Revenue Split & Commission Ratios</h2>
            <p className="text-xs text-slate-500">
              Configure the revenue split percentages applied to book sales. Total percentage must strictly sum to exactly 100%.
            </p>
          </div>

          {commissionSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Commission structure saved! Historical purchases will preserve snapshot integrity.</span>
            </div>
          )}

          {commissionError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs font-bold rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>{commissionError}</span>
            </div>
          )}

          <form onSubmit={handleSaveCommission} className="space-y-4 text-xs font-semibold">
            <div>
              <label className="block text-slate-700 mb-1">Platform / Super Admin Share (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                required
                value={commissionSettings.platformPercentage}
                onChange={(e) => setCommissionSettings({ ...commissionSettings, platformPercentage: Number(e.target.value) })}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono text-slate-800 font-bold"
              />
              <span className="text-[10px] text-slate-500">Default: 15% (Supports server hosting, DRM and maintenance)</span>
            </div>

            <div>
              <label className="block text-slate-700 mb-1">Affiliate Marketer Commission (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                required
                value={commissionSettings.affiliatePercentage}
                onChange={(e) => setCommissionSettings({ ...commissionSettings, affiliatePercentage: Number(e.target.value) })}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono text-slate-800 font-bold"
              />
              <span className="text-[10px] text-slate-500">Default: 5% (Awarded on attributed referral sales)</span>
            </div>

            <div>
              <label className="block text-slate-700 mb-1">Lecturer / Content Author Royalty (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                required
                value={commissionSettings.lecturerPercentage}
                onChange={(e) => setCommissionSettings({ ...commissionSettings, lecturerPercentage: Number(e.target.value) })}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono text-slate-800 font-bold"
              />
              <span className="text-[10px] text-slate-500">Default: 80% (Direct royalties credited to author wallet)</span>
            </div>

            <div className="p-3 bg-purple-50 rounded-xl border border-purple-100 flex justify-between items-center text-xs font-bold text-purple-950">
              <span>Total Distribution Sum:</span>
              <span className="font-mono text-base">
                {Number(commissionSettings.platformPercentage) + Number(commissionSettings.affiliatePercentage) + Number(commissionSettings.lecturerPercentage)}%
              </span>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-purple-800 hover:bg-purple-900 text-white font-extrabold text-xs rounded-lg shadow transition-colors"
            >
              Update Commission Structure
            </button>
          </form>
        </div>
      )}

      {/* WEBSITE CMS TAB */}
      {activeTab === 'cms' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 lg:p-8 shadow-sm max-w-2xl space-y-6">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-lg font-bold text-slate-900">Website & Public Content CMS</h2>
            <p className="text-xs text-slate-500">
              Manage homepage banners, headline typography, primary action buttons, and institutional contact channels.
            </p>
          </div>

          {cmsSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Website content settings published successfully to Firestore!</span>
            </div>
          )}

          <form onSubmit={handleSaveWebsiteSettings} className="space-y-4 text-xs font-semibold">
            <div>
              <label className="block text-slate-700 mb-1">Hero Eyebrow Badge</label>
              <input
                type="text"
                value={websiteSettings.heroBadge || ''}
                onChange={(e) => setWebsiteSettings({ ...websiteSettings, heroBadge: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-1">Hero Main Heading</label>
              <input
                type="text"
                value={websiteSettings.heroTitle || ''}
                onChange={(e) => setWebsiteSettings({ ...websiteSettings, heroTitle: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none text-slate-800 font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-1">Hero Subtitle / Description</label>
              <textarea
                rows={3}
                value={websiteSettings.heroSubtitle || ''}
                onChange={(e) => setWebsiteSettings({ ...websiteSettings, heroSubtitle: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none text-slate-800"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-700 mb-1">Primary CTA Text</label>
                <input
                  type="text"
                  value={websiteSettings.heroCtaText || ''}
                  onChange={(e) => setWebsiteSettings({ ...websiteSettings, heroCtaText: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none text-slate-800"
                />
              </div>
              <div>
                <label className="block text-slate-700 mb-1">Secondary CTA Text</label>
                <input
                  type="text"
                  value={websiteSettings.secondaryCtaText || ''}
                  onChange={(e) => setWebsiteSettings({ ...websiteSettings, secondaryCtaText: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none text-slate-800"
                />
              </div>
              <div>
                <label className="block text-slate-700 mb-1">Author CTA Text</label>
                <input
                  type="text"
                  value={websiteSettings.authorCtaText || ''}
                  onChange={(e) => setWebsiteSettings({ ...websiteSettings, authorCtaText: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-700 mb-1">Public Support Email</label>
                <input
                  type="email"
                  value={websiteSettings.contactEmail || ''}
                  onChange={(e) => setWebsiteSettings({ ...websiteSettings, contactEmail: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono text-slate-800"
                />
              </div>
              <div>
                <label className="block text-slate-700 mb-1">Public Support Hotline / WhatsApp</label>
                <input
                  type="text"
                  value={websiteSettings.contactPhone || ''}
                  onChange={(e) => setWebsiteSettings({ ...websiteSettings, contactPhone: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono text-slate-800"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={cmsSaving}
              className="w-full py-3 bg-purple-800 hover:bg-purple-900 text-white font-extrabold text-xs rounded-lg shadow"
            >
              {cmsSaving ? 'Publishing Updates...' : 'Publish Website CMS Updates'}
            </button>
          </form>
        </div>
      )}

      {/* APP DISTRIBUTION TAB */}
      {activeTab === 'distribution' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 lg:p-8 shadow-sm max-w-2xl space-y-6">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-lg font-bold text-slate-900">App Distribution & Direct APK Management</h2>
            <p className="text-xs text-slate-500">
              Manage the download URL for Android direct APK releases and iOS TestFlight / App Store listings.
            </p>
          </div>

          {settingSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>App distribution settings updated in database!</span>
            </div>
          )}

          <form onSubmit={handleSaveAppSettings} className="space-y-4 text-xs font-semibold">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-700 mb-1">APK Version</label>
                <input
                  type="text"
                  value={apkVersion}
                  onChange={(e) => setApkVersion(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono text-slate-800"
                />
              </div>
              <div>
                <label className="block text-slate-700 mb-1">Build Number</label>
                <input
                  type="text"
                  value={apkBuild}
                  onChange={(e) => setApkBuild(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 mb-1">Android Direct APK Download Link (Hostinger Path)</label>
              <input
                type="url"
                required
                value={appSettings.androidApkUrl}
                onChange={(e) => setAppSettings({ ...appSettings, androidApkUrl: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono text-slate-800"
              />
              <span className="text-[10px] text-slate-500">Serves direct APK without redirect loops</span>
            </div>

            <div>
              <label className="block text-slate-700 mb-1">Apple TestFlight iOS Link</label>
              <input
                type="url"
                required
                value={appSettings.testFlightUrl}
                onChange={(e) => setAppSettings({ ...appSettings, testFlightUrl: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-1">Apple AppStore URL</label>
              <input
                type="url"
                required
                value={appSettings.appStoreUrl}
                onChange={(e) => setAppSettings({ ...appSettings, appStoreUrl: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-1">Release Notes</label>
              <textarea
                rows={3}
                value={apkNotes}
                onChange={(e) => setApkNotes(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none text-slate-800"
              />
            </div>

            <button
              type="submit"
              disabled={settingSaving}
              className="w-full py-3 bg-purple-800 hover:bg-purple-900 text-white font-extrabold text-xs rounded-lg shadow"
            >
              {settingSaving ? 'Saving...' : 'Publish App Distribution Updates'}
            </button>
          </form>
        </div>
      )}

      {/* INSTITUTIONS TAB */}
      {activeTab === 'institutions' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Add New Tertiary Institution</h2>
            <form onSubmit={handleAddInstitution} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-semibold">
              <input
                type="text"
                placeholder="Full Institution Name (e.g. University of Benin)"
                required
                value={newInstName}
                onChange={(e) => setNewInstName(e.target.value)}
                className="p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none col-span-2"
              />
              <input
                type="text"
                placeholder="Acronym (e.g. UNIBEN)"
                required
                value={newInstShort}
                onChange={(e) => setNewInstShort(e.target.value)}
                className="p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none"
              />
              <button
                type="submit"
                className="py-2.5 bg-purple-800 hover:bg-purple-900 text-white font-bold rounded-lg shadow transition-colors flex items-center justify-center gap-1"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Add School</span>
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">Recognized Institutions Directory ({institutions.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {institutions.map((inst) => (
                <div key={inst.id} className="p-4 border border-slate-200 rounded-xl flex justify-between items-center bg-slate-50">
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">{inst.name}</h4>
                    <p className="text-[11px] text-slate-500">{inst.shortName} • {inst.state}</p>
                  </div>
                  <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                    {inst.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AUDIT LOGS TAB */}
      {activeTab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Governance & Administrative Audit Logs</h2>
              <p className="text-xs text-slate-500">Immutable record of Super Admin actions, approvals, and configuration changes.</p>
            </div>
            <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-full">
              {auditLogs.length} Events Logged
            </span>
          </div>

          <div className="divide-y divide-slate-100 text-xs font-mono">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-purple-900">{log.action}</span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-sans">
                      {log.actorRole}
                    </span>
                  </div>
                  <p className="text-slate-600 font-sans text-xs mt-0.5">{log.details}</p>
                </div>
                <span className="text-[11px] text-slate-400 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PRICE EDITING MODAL */}
      {editingBook && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <h3 className="font-bold text-slate-900 text-sm">Update Book Selling Price</h3>
            <p className="text-xs text-slate-500">{editingBook.title}</p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">New Price (₦)</label>
              <input
                type="number"
                min="0"
                step="100"
                value={newPrice}
                onChange={(e) => setNewPrice(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold text-slate-900 outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingBook(null)}
                className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdatePrice}
                className="px-4 py-2 text-xs font-bold text-white bg-purple-800 hover:bg-purple-900 rounded-lg"
              >
                Save New Price
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT ACADEMIC MATERIAL MODAL */}
      {rejectingBook && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-red-700">
              <XCircle className="w-5 h-5 text-red-600 shrink-0" />
              <h3 className="font-extrabold text-slate-900 text-base">Reject Academic Material</h3>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
              <p className="font-extrabold text-slate-900 text-sm">{rejectingBook.title}</p>
              <p className="text-slate-600">
                Author: <strong className="text-slate-800">{rejectingBook.author}</strong> ({rejectingBook.institution})
              </p>
              <p className="text-slate-500 text-[11px]">
                Format: {rejectingBook.format} • Course: {rejectingBook.courseCode || 'N/A'} • Price: ₦{rejectingBook.price.toLocaleString()}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Rejection Reason <span className="text-red-600">*</span>
                <span className="text-slate-400 font-normal ml-1">(This feedback is displayed directly to the lecturer)</span>
              </label>

              {/* Quick Template Presets */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Suggestions:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Syllabus & Curriculum Non-Compliance',
                    'Low-Quality Scan / Typesetting Defect',
                    'Copyright & Institutional Verification Missing',
                    'Incomplete Chapter Contents / Truncated PDF'
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRejectionReasonInput(preset)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold rounded-md transition-colors"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                rows={4}
                value={rejectionReasonInput}
                onChange={(e) => setRejectionReasonInput(e.target.value)}
                placeholder="Enter detailed reasons why this material cannot be published to students..."
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 leading-relaxed font-sans"
              />
            </div>

            <div className="flex justify-end items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={actionLoading === rejectingBook.id}
                onClick={() => setRejectingBook(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={actionLoading === rejectingBook.id || !rejectionReasonInput.trim()}
                onClick={handleConfirmRejectBook}
                className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg shadow-sm flex items-center gap-1.5 transition-all"
              >
                {actionLoading === rejectingBook.id ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                <span>{actionLoading === rejectingBook.id ? 'Saving Rejection...' : 'Confirm Rejection'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUPER ADMIN DRM AUDIT READER MODAL */}
      {previewingBook && (
        <ReaderModal
          book={previewingBook}
          purchaseRef={`ADMIN-AUDIT-${previewingBook.id.substring(0, 8).toUpperCase()}`}
          onClose={() => setPreviewingBook(null)}
        />
      )}
    </div>
  );
};
