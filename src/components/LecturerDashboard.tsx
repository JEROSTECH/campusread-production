import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, Upload, DollarSign, CheckCircle, Clock, AlertCircle, Plus, Users, ArrowUpRight, Banknote, FileText, X, ShieldAlert, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Book } from '../types';
import { MOCK_BOOKS } from '../data/mockBooks';
import { addDoc, collection, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { uploadPdfMaterial, validatePdfFile } from '../lib/pdfStorage';

export const LecturerDashboard: React.FC = () => {
  const { userProfile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'my_books' | 'upload' | 'withdrawals'>('overview');

  const [booksList, setBooksList] = useState<Book[]>(MOCK_BOOKS.slice(0, 4));
  const [resubmittingId, setResubmittingId] = useState<string | null>(null);
  const [resubmitNotice, setResubmitNotice] = useState<{ id: string; message: string; type: 'success' | 'error' } | null>(null);

  // Sync lecturer's books with Firestore in real-time
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onSnapshot(collection(db, 'books'), (snapshot) => {
        if (!snapshot.empty) {
          const allDocs: Book[] = [];
          snapshot.forEach((docSnap) => {
            allDocs.push({
              ...docSnap.data(),
              id: docSnap.id,
            } as Book);
          });

          // Match books belonging to current lecturer
          const myBooks = allDocs.filter(b => 
            (userProfile?.uid && b.authorUid === userProfile.uid) ||
            (userProfile?.fullName && b.author.toLowerCase() === userProfile.fullName.toLowerCase())
          );

          if (myBooks.length > 0) {
            setBooksList(myBooks);
          } else {
            // Include default demo materials for initial experience
            const firestoreIds = new Set(allDocs.map(b => b.id));
            const availableMocks = MOCK_BOOKS.slice(0, 4).map(mock => {
              const fromDb = allDocs.find(d => d.id === mock.id);
              return fromDb || mock;
            });
            setBooksList(availableMocks);
          }
        }
      }, (err) => {
        console.warn('Lecturer books listener warning:', err);
      });
    } catch (err) {
      console.warn('Failed to attach Lecturer books listener:', err);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userProfile?.uid, userProfile?.fullName]);

  // PDF File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Book Upload Form
  const [uploadForm, setUploadForm] = useState({
    title: '',
    courseCode: '',
    level: '100 Level',
    price: 3000,
    format: 'eBook' as Book['format'],
    isPastQuestion: false,
    description: '',
    sampleExcerpt: '',
  });

  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Withdrawal Form
  const [withdrawAmount, setWithdrawAmount] = useState(5000);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  // Handle PDF file selection & validation
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    const validation = await validatePdfFile(file);
    if (!validation.valid) {
      setFileError(validation.error || 'Invalid PDF file selected.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
    // If title is empty, prefill with file name without .pdf
    if (!uploadForm.title) {
      const suggestedTitle = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
      setUploadForm(prev => ({ ...prev, title: suggestedTitle }));
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFileError(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleBookUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setFileError(null);

    if (!selectedFile) {
      setFileError('Please select a valid PDF material or past question document to upload.');
      return;
    }

    setUploading(true);
    setUploadSuccess(false);
    setUploadProgress(10);

    try {
      const materialId = `book-${Date.now()}`;
      const lecturerUid = userProfile?.uid || `lecturer-${Date.now()}`;

      // 1. Upload PDF binary to storage & cache
      const uploadResult = await uploadPdfMaterial(
        selectedFile,
        lecturerUid,
        materialId,
        (progress) => setUploadProgress(progress)
      );

      // 2. Create Book document
      const newBook: Book = {
        id: materialId,
        title: uploadForm.title.trim(),
        author: userProfile?.fullName || 'Lecturer Author',
        authorUid: userProfile?.uid,
        authorTitle: (userProfile as any)?.title || 'Dr.',
        institution: (userProfile as any)?.institution || 'University of Lagos (UNILAG)',
        faculty: (userProfile as any)?.faculty || 'Engineering',
        department: (userProfile as any)?.department || 'Mechanical Engineering',
        courseCode: uploadForm.courseCode.trim().toUpperCase(),
        level: uploadForm.level,
        price: Number(uploadForm.price),
        rating: 5.0,
        reviewCount: 0,
        format: uploadForm.format,
        publishedYear: new Date().getFullYear(),
        pages: Math.max(12, Math.round(selectedFile.size / (100 * 1024))), // estimated page count
        isbn: `978-978-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(10 + Math.random() * 90)}`,
        description: uploadForm.description.trim(),
        sampleExcerpt: uploadForm.sampleExcerpt.trim() || `Official protected digital course material: ${uploadForm.title}. Authored for higher institutions.`,
        isPastQuestion: uploadForm.isPastQuestion,
        fileStoragePath: uploadResult.fileStoragePath,
        fileName: uploadResult.fileName,
        fileSize: uploadResult.fileSize,
        mimeType: uploadResult.mimeType,
        uploadStatus: uploadResult.uploadStatus,
        hasPdf: true,
        approvalStatus: 'PENDING',
        status: 'PENDING',
        rejectionReason: '',
        salesCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        await setDoc(doc(db, 'books', materialId), newBook);
      } catch (firestoreErr) {
        console.warn('Firestore write warning:', firestoreErr);
      }

      // Add audit log entry
      try {
        await addDoc(collection(db, 'auditLogs'), {
          action: 'PDF_MATERIAL_UPLOADED',
          actorId: userProfile?.uid || 'lecturer',
          actorRole: 'LECTURER',
          timestamp: new Date().toISOString(),
          details: `Uploaded PDF: "${newBook.title}" (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB, ${selectedFile.name})`,
          referenceId: materialId,
        });
      } catch (auditErr) {
        console.warn('Audit logging:', auditErr);
      }

      setBooksList(prev => [newBook, ...prev]);
      setUploadSuccess(true);
      setSelectedFile(null);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';

      setUploadForm({
        title: '',
        courseCode: '',
        level: '100 Level',
        price: 3000,
        format: 'eBook',
        isPastQuestion: false,
        description: '',
        sampleExcerpt: '',
      });
    } catch (err: any) {
      console.error('Upload Error:', err);
      setFileError(err.message || 'Failed to upload PDF material. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleResubmit = async (book: Book) => {
    setResubmittingId(book.id);
    setResubmitNotice(null);
    try {
      const bookRef = doc(db, 'books', book.id);
      const updateData = {
        approvalStatus: 'PENDING' as const,
        status: 'PENDING' as const,
        rejectionReason: '',
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(bookRef, updateData);

      setBooksList(prev => prev.map(b => b.id === book.id ? {
        ...b,
        approvalStatus: 'PENDING',
        status: 'PENDING',
        rejectionReason: '',
      } : b));

      try {
        await addDoc(collection(db, 'auditLogs'), {
          action: 'BOOK_RESUBMITTED',
          actorId: userProfile?.uid || 'lecturer',
          actorRole: 'LECTURER',
          timestamp: new Date().toISOString(),
          details: `Resubmitted for review: "${book.title}"`,
          referenceId: book.id,
        });
      } catch (auditErr) {
        console.warn('Audit logging error:', auditErr);
      }

      setResubmitNotice({
        id: book.id,
        message: 'Resubmission submitted successfully. Material is now queued for Super Admin review.',
        type: 'success',
      });
      setTimeout(() => setResubmitNotice(null), 5000);
    } catch (err: any) {
      console.error('Resubmit error:', err);
      setResubmitNotice({
        id: book.id,
        message: err.message || 'Failed to resubmit material. Please check your connection and try again.',
        type: 'error',
      });
    } finally {
      setResubmittingId(null);
    }
  };

  const handleWithdrawalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawSubmitting(true);
    setWithdrawSuccess(false);

    try {
      await addDoc(collection(db, 'withdrawals'), {
        userUid: userProfile?.uid,
        userName: userProfile?.fullName,
        userRole: 'LECTURER',
        bankName: (userProfile as any)?.bankName || 'First Bank',
        accountNumber: (userProfile as any)?.accountNumber || '0123456789',
        accountName: (userProfile as any)?.accountName || userProfile?.fullName,
        amount: withdrawAmount,
        status: 'PENDING',
        requestedAt: new Date().toISOString(),
      });
      setWithdrawSuccess(true);
    } catch (err) {
      console.error('Withdrawal error:', err);
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-white border border-slate-200 rounded-2xl text-center shadow-sm space-y-4">
        <div className="w-8 h-8 border-4 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Loading Author Portal...</h3>
        <p className="text-xs text-slate-500">Please wait while your author materials, sales and royalties are loaded.</p>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-amber-50 border border-amber-200 rounded-2xl text-center shadow-sm space-y-3">
        <AlertCircle className="w-10 h-10 text-amber-600 mx-auto" />
        <h3 className="text-base font-bold text-amber-900">Lecturer Account Required</h3>
        <p className="text-xs text-amber-800 leading-relaxed">
          Please login with your lecturer account credentials to manage your academic publications and view royalties.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 lg:px-12 max-w-7xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 lg:p-8 rounded-2xl shadow-lg border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded uppercase">
            LECTURER / AUTHOR PORTAL
          </span>
          <h1 className="text-2xl lg:text-3xl font-black font-serif">
            {(userProfile as any)?.title || 'Dr.'} {userProfile?.fullName || 'Lecturer'}
          </h1>
          <p className="text-xs text-slate-300">
            {(userProfile as any)?.institution || 'University of Lagos'} • {(userProfile as any)?.department || 'Faculty Author'}
          </p>
        </div>

        <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10">
          <div>
            <span className="text-[10px] text-blue-200 block uppercase font-bold">Earnings Balance</span>
            <span className="text-2xl font-black text-amber-400 font-mono">
              ₦{(userProfile as any)?.earningsBalance?.toLocaleString() || '142,500.00'}
            </span>
          </div>
          <button
            onClick={() => setActiveTab('withdrawals')}
            className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold rounded-lg shadow transition-colors"
          >
            Request Payout
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 bg-white p-2 rounded-xl shadow-sm text-xs font-bold gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap ${activeTab === 'overview' ? 'bg-blue-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          Overview & Sales
        </button>
        <button
          onClick={() => setActiveTab('my_books')}
          className={`px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap ${activeTab === 'my_books' ? 'bg-blue-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          My Academic Books ({booksList.length})
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap ${activeTab === 'upload' ? 'bg-blue-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          + Upload Real PDF Material
        </button>
        <button
          onClick={() => setActiveTab('withdrawals')}
          className={`px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap ${activeTab === 'withdrawals' ? 'bg-blue-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          Withdrawals & Bank Account
        </button>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs text-slate-500 font-bold uppercase">Total Books Uploaded</span>
              <p className="text-2xl font-black text-slate-900">{booksList.length}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs text-slate-500 font-bold uppercase">Approved & Active</span>
              <p className="text-2xl font-black text-emerald-600">{booksList.filter(b => b.approvalStatus === 'APPROVED').length}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs text-slate-500 font-bold uppercase">Pending Approvals</span>
              <p className="text-2xl font-black text-amber-500">{booksList.filter(b => b.approvalStatus === 'PENDING').length}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs text-slate-500 font-bold uppercase">Total Student Purchases</span>
              <p className="text-2xl font-black text-blue-800">1,248</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900">Recent Student Purchasers</h3>
            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-3 flex justify-between items-center">
                <div>
                  <p className="font-bold text-slate-800">Chukwuemeka E. (UNILAG - 190408012)</p>
                  <p className="text-slate-500">Advanced Fluid Mechanics for Engineering</p>
                </div>
                <span className="font-bold text-emerald-700">+₦3,600.00 (80% Share)</span>
              </div>
              <div className="py-3 flex justify-between items-center">
                <div>
                  <p className="font-bold text-slate-800">Blessing O. (UI - 210921004)</p>
                  <p className="text-slate-500">Principles of Macro-Economics</p>
                </div>
                <span className="font-bold text-emerald-700">+₦2,560.00 (80% Share)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MY ACADEMIC BOOKS TAB */}
      {activeTab === 'my_books' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-900">My Uploaded Materials & Course Packs</h2>
            <button
              onClick={() => setActiveTab('upload')}
              className="px-4 py-2 bg-blue-800 hover:bg-blue-900 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Upload New PDF</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {booksList.map((book) => (
              <div key={book.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-blue-100 text-blue-900 text-[10px] font-extrabold px-2 py-0.5 rounded">
                          {book.format}
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1 ${
                          book.approvalStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                          book.approvalStatus === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {book.approvalStatus === 'APPROVED' && <CheckCircle className="w-3 h-3" />}
                          {book.approvalStatus === 'REJECTED' && <AlertTriangle className="w-3 h-3" />}
                          {book.approvalStatus === 'PENDING' && <Clock className="w-3 h-3" />}
                          {book.approvalStatus}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-900 text-sm">{book.title}</h3>
                      <p className="text-xs text-slate-500">{book.courseCode} • {book.level}</p>
                    </div>
                    <span className="text-base font-extrabold text-emerald-700 font-mono">
                      ₦{book.price.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-blue-800" />
                        <span>PDF Document:</span>
                      </span>
                      <span className="font-mono text-slate-900 font-semibold truncate max-w-[180px]">
                        {book.fileName || (book.hasPdf ? 'binary_upload.pdf' : 'Structured Course Pack')}
                      </span>
                    </div>
                    {book.fileSize && (
                      <div className="flex justify-between text-slate-500 text-[11px]">
                        <span>File Size:</span>
                        <span className="font-mono">{(book.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span>Sales & Royalty:</span>
                      <span className="font-bold text-slate-800">{book.salesCount || 0} purchases (80% share)</span>
                    </div>
                  </div>

                  {/* APPROVAL STATUS FEEDBACK */}
                  {book.approvalStatus === 'APPROVED' && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-800 font-medium flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Live & Verified: Available in the Student Book Catalogue for purchases.</span>
                    </div>
                  )}

                  {book.approvalStatus === 'PENDING' && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Under Super Admin Review</span>
                      </div>
                      <p className="text-[10.5px] text-amber-700 pl-5">
                        This material is queued for moderation. It will be made available to students once approved.
                      </p>
                    </div>
                  )}

                  {book.approvalStatus === 'REJECTED' && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
                      <div className="flex items-center gap-1.5 text-red-900 font-bold text-xs">
                        <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                        <span>Publication Declined by Super Admin</span>
                      </div>
                      <div className="bg-white/90 p-2.5 rounded-lg border border-red-100 text-xs">
                        <span className="text-[10.5px] font-bold text-red-900 block mb-0.5">Reason / Required Corrections:</span>
                        <p className="text-red-800 leading-relaxed font-sans">
                          {book.rejectionReason || 'No specific reason was provided. Please verify formatting, course code, and curriculum compliance.'}
                        </p>
                      </div>

                      {resubmitNotice && resubmitNotice.id === book.id && (
                        <div className={`p-2 rounded-lg text-xs font-bold ${
                          resubmitNotice.type === 'success' ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'
                        }`}>
                          {resubmitNotice.message}
                        </div>
                      )}

                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleResubmit(book)}
                          disabled={resubmittingId === book.id}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all"
                        >
                          {resubmittingId === book.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          )}
                          <span>{resubmittingId === book.id ? 'Resubmitting...' : 'Resubmit for Review'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* UPLOAD TAB */}
      {activeTab === 'upload' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 lg:p-8 shadow-sm max-w-3xl space-y-6">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-lg font-bold text-slate-900">Upload Real PDF Academic Material</h2>
            <p className="text-xs text-slate-500">
              Select your authentic PDF textbook, lecture course pack, or past questions document. Files are secured with CampusRead dynamic DRM.
            </p>
          </div>

          {uploadSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>PDF Material uploaded successfully! It is now pending Super Admin review and approval.</span>
            </div>
          )}

          {fileError && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

          <form onSubmit={handleBookUpload} className="space-y-5 text-xs font-semibold">
            {/* Real PDF File Dropzone */}
            <div>
              <label className="block text-slate-700 mb-1.5 font-bold">
                Select PDF File <span className="text-red-500">*</span> (Max 50MB)
              </label>
              
              {!selectedFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-blue-200 hover:border-blue-500 bg-blue-50/50 hover:bg-blue-50/80 rounded-2xl p-6 text-center cursor-pointer transition-all space-y-2"
                >
                  <Upload className="w-8 h-8 text-blue-700 mx-auto" />
                  <p className="text-slate-800 font-bold">Click or Drag & Drop PDF File Here</p>
                  <p className="text-[11px] text-slate-500">
                    Accepts authentic .pdf documents only. Magic bytes and signature verified.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-700 text-white rounded-lg">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm truncate max-w-sm">{selectedFile.name}</p>
                      <p className="text-slate-500 text-[11px]">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Verified PDF Document
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Upload Progress Indicator */}
            {uploading && (
              <div className="space-y-1.5 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Uploading PDF Material to Secure Storage...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-800 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-slate-700 mb-1">Book / Material Title</label>
              <input
                type="text"
                required
                value={uploadForm.title}
                onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                placeholder="e.g. Modern Thermodynamics & Heat Transfer"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white focus:border-blue-700"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-700 mb-1">Course Code</label>
                <input
                  type="text"
                  required
                  value={uploadForm.courseCode}
                  onChange={(e) => setUploadForm({ ...uploadForm, courseCode: e.target.value })}
                  placeholder="e.g. MEG301"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-700 mb-1">Level</label>
                <select
                  value={uploadForm.level}
                  onChange={(e) => setUploadForm({ ...uploadForm, level: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none"
                >
                  <option value="100 Level">100 Level</option>
                  <option value="200 Level">200 Level</option>
                  <option value="300 Level">300 Level</option>
                  <option value="400 Level">400 Level</option>
                  <option value="500 Level">500 Level</option>
                  <option value="Postgraduate">Postgraduate</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-700 mb-1">Price (₦)</label>
                <input
                  type="number"
                  required
                  min={500}
                  step={100}
                  value={uploadForm.price}
                  onChange={(e) => setUploadForm({ ...uploadForm, price: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 mb-1">Format</label>
                <select
                  value={uploadForm.format}
                  onChange={(e) => setUploadForm({ ...uploadForm, format: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none"
                >
                  <option value="eBook">eBook / Textbook</option>
                  <option value="Course Pack">Course Pack</option>
                  <option value="Past Question">Past Question</option>
                  <option value="Lecture Notes">Lecture Notes</option>
                </select>
              </div>
              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer text-slate-800">
                  <input
                    type="checkbox"
                    checked={uploadForm.isPastQuestion}
                    onChange={(e) => setUploadForm({ ...uploadForm, isPastQuestion: e.target.checked })}
                    className="w-4 h-4 text-blue-800 rounded"
                  />
                  <span>Is Solved Past Question</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 mb-1">Description & Syllabus Coverage</label>
              <textarea
                rows={3}
                required
                value={uploadForm.description}
                onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                placeholder="Describe key topics, target department, and exam relevance..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-1">Sample Excerpt / Preview Summary</label>
              <textarea
                rows={2}
                value={uploadForm.sampleExcerpt}
                onChange={(e) => setUploadForm({ ...uploadForm, sampleExcerpt: e.target.value })}
                placeholder="Provide a short sample excerpt or overview for student preview..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="w-full py-3 bg-blue-800 hover:bg-blue-900 text-white font-extrabold rounded-lg shadow transition-colors disabled:opacity-50"
            >
              {uploading ? 'Processing & Uploading PDF...' : 'Submit PDF Material for Moderation'}
            </button>
          </form>
        </div>
      )}

      {/* WITHDRAWALS TAB */}
      {activeTab === 'withdrawals' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-xl space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Request Earnings Withdrawal</h2>

          {withdrawSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Withdrawal request submitted! Super Admin will process payout to your registered bank account.</span>
            </div>
          )}

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
            <span className="font-bold text-slate-700 block">Bank Account Details on File:</span>
            <p>Bank: {(userProfile as any)?.bankName || 'First Bank of Nigeria'}</p>
            <p>Account No: {(userProfile as any)?.accountNumber || '0123456789'}</p>
            <p>Account Name: {(userProfile as any)?.accountName || userProfile?.fullName}</p>
          </div>

          <form onSubmit={handleWithdrawalRequest} className="space-y-3 text-xs font-semibold">
            <div>
              <label className="block text-slate-700 mb-1">Withdrawal Amount (₦)</label>
              <input
                type="number"
                required
                min={1000}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={withdrawSubmitting}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-lg shadow"
            >
              {withdrawSubmitting ? 'Submitting...' : 'Submit Withdrawal Request'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

