import React, { useState } from 'react';
import { Book } from '../types';
import { X, Star, ShieldCheck, BookOpen, Download, ShoppingBag, CheckCircle2, Award, FileText, Share2, Wallet, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface BookDetailModalProps {
  book: Book;
  isSaved: boolean;
  onClose: () => void;
  onAddToCart: (book: Book) => void;
  onToggleSave: (book: Book) => void;
  onOpenReader: (book: Book) => void;
}

export const BookDetailModal: React.FC<BookDetailModalProps> = ({
  book,
  isSaved,
  onClose,
  onAddToCart,
  onToggleSave,
  onOpenReader,
}) => {
  const { userProfile, refreshUserProfile } = useAuth();
  const [selectedLicense, setSelectedLicense] = useState<'digital' | 'bundle'>('digital');
  const [activeTab, setActiveTab] = useState<'overview' | 'toc' | 'excerpt'>('overview');
  const [copied, setCopied] = useState(false);
  const [purchasingWallet, setPurchasingWallet] = useState(false);
  const [walletSuccess, setWalletSuccess] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const price = selectedLicense === 'bundle' ? book.price + 2000 : book.price;
  const studentWalletBal = Number((userProfile as any)?.walletBalance || 0);
  const isStudent = userProfile && (!userProfile.role || userProfile.role === 'STUDENT');

  const handleWalletPurchase = async () => {
    if (!userProfile?.uid) {
      setWalletError("Please log in to purchase with your student wallet.");
      return;
    }
    if (studentWalletBal < price) {
      setWalletError(`Insufficient wallet balance (₦${studentWalletBal.toLocaleString()}). Please fund your wallet in the Student Dashboard.`);
      return;
    }

    setPurchasingWallet(true);
    setWalletError(null);

    try {
      const res = await fetch('/api/wallet/purchase-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentUid: userProfile.uid,
          bookId: book.id,
          bookTitle: book.title,
          authorUid: book.authorUid || "author-verified",
          price: price
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setWalletError(data.message || 'Failed to purchase textbook with wallet.');
        setPurchasingWallet(false);
        return;
      }

      setWalletSuccess(true);
      if (refreshUserProfile) {
        await refreshUserProfile();
      }
    } catch (err: any) {
      setWalletError('Network error while purchasing book with wallet.');
    } finally {
      setPurchasingWallet(false);
    }
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="book-detail-modal-overlay" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div id="book-detail-modal-container" className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[90vh]">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold uppercase rounded border border-blue-100">
              {book.department}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              ISBN: {book.isbn}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors text-xs font-semibold flex items-center gap-1"
            >
              <Share2 className="w-4 h-4" />
              <span>{copied ? 'Link Copied!' : 'Share'}</span>
            </button>
            <button
              id="close-detail-modal"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Grid */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Left Column: Visual Cover & Purchase Options */}
          <div className="md:col-span-5 space-y-6">
            <div className={`h-64 rounded-xl bg-gradient-to-br ${book.coverGradient} p-6 text-white flex flex-col justify-between shadow-lg font-serif relative overflow-hidden`}>
              <div className="flex justify-between items-start">
                <span className="px-2 py-0.5 bg-white/20 backdrop-blur text-[10px] uppercase font-sans font-bold tracking-widest rounded">
                  {book.format}
                </span>
                <ShieldCheck className="w-6 h-6 text-emerald-300" />
              </div>

              <div>
                <span className="text-xs font-sans opacity-90 block mb-1">
                  {book.institution}
                </span>
                <h2 className="text-xl font-bold leading-snug drop-shadow-sm">
                  {book.title}
                </h2>
              </div>

              <div className="text-xs font-sans font-medium text-white/90 border-t border-white/20 pt-2 flex justify-between items-center">
                <span>{book.author}</span>
                <span>{book.edition}</span>
              </div>
            </div>

            {/* License Option Selector */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                Select Access Plan
              </label>

              <div
                onClick={() => setSelectedLicense('digital')}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                  selectedLicense === 'digital'
                    ? 'border-blue-700 bg-blue-50/50 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="access-license"
                  checked={selectedLicense === 'digital'}
                  onChange={() => setSelectedLicense('digital')}
                  className="mt-1 text-blue-700 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="flex justify-between items-center font-bold text-sm text-slate-900">
                    <span>Full Digital E-Reader License</span>
                    <span>₦{book.price.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Instant offline reader access on mobile, tablet, and web dashboard.
                  </p>
                </div>
              </div>

              <div
                onClick={() => setSelectedLicense('bundle')}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                  selectedLicense === 'bundle'
                    ? 'border-blue-700 bg-blue-50/50 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="access-license"
                  checked={selectedLicense === 'bundle'}
                  onChange={() => setSelectedLicense('bundle')}
                  className="mt-1 text-blue-700 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="flex justify-between items-center font-bold text-sm text-slate-900">
                    <span>Print Course Pack + Digital Bundle</span>
                    <span>₦{(book.price + 2000).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Includes physical textbook campus pickup + unlimited digital e-reader.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-2">
              {walletSuccess ? (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-center space-y-2">
                  <div className="flex items-center justify-center gap-1.5 text-emerald-800 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Purchased with Student Wallet!</span>
                  </div>
                  <button
                    onClick={() => {
                      onOpenReader(book);
                      onClose();
                    }}
                    className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs transition-colors"
                  >
                    Open in DRM E-Reader Now
                  </button>
                </div>
              ) : (
                <>
                  {isStudent && (
                    <button
                      id="modal-wallet-buy-btn"
                      onClick={handleWalletPurchase}
                      disabled={purchasingWallet}
                      className="w-full py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold rounded-lg shadow transition-all flex items-center justify-center gap-2 text-xs"
                    >
                      {purchasingWallet ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Processing Wallet Debit...</span>
                        </>
                      ) : (
                        <>
                          <Wallet className="w-4 h-4" />
                          <span>1-Click Buy with Wallet (₦{price.toLocaleString()})</span>
                        </>
                      )}
                    </button>
                  )}

                  {walletError && (
                    <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700 flex items-start gap-1.5 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{walletError}</span>
                    </div>
                  )}

                  <button
                    id="modal-add-to-cart-btn"
                    onClick={() => onAddToCart(book)}
                    className="w-full py-3 bg-blue-700 text-white font-bold rounded-lg shadow-md hover:bg-blue-800 transition-all flex items-center justify-center gap-2 text-xs"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Add to Cart — ₦{price.toLocaleString()}
                  </button>

                  <button
                    id="modal-preview-reader-btn"
                    onClick={() => onOpenReader(book)}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg transition-all flex items-center justify-center gap-2 text-xs"
                  >
                    <BookOpen className="w-4 h-4 text-blue-700" />
                    Launch Sample Reader
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Right Column: Detailed Info Tabs */}
          <div className="md:col-span-7 space-y-6 flex flex-col">
            {/* Title & Lecturer Metadata */}
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
                <span>{book.institution}</span>
                <span>•</span>
                <span>{book.publishedYear} Edition</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2 leading-snug">
                {book.title}
              </h1>

              {/* Author & Lecturer verification */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-sm shrink-0">
                  {book.author.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-sm text-slate-900">
                    <span>{book.author}</span>
                    <ShieldCheck className="w-4 h-4 text-blue-700 fill-blue-50" title="Verified University Lecturer" />
                  </div>
                  <div className="text-xs text-slate-500 font-medium">
                    {book.authorTitle}
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 gap-6 text-sm font-bold">
              <button
                onClick={() => setActiveTab('overview')}
                className={`pb-2.5 transition-colors border-b-2 ${
                  activeTab === 'overview'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('toc')}
                className={`pb-2.5 transition-colors border-b-2 ${
                  activeTab === 'toc'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Syllabus & TOC
              </button>
              <button
                onClick={() => setActiveTab('excerpt')}
                className={`pb-2.5 transition-colors border-b-2 ${
                  activeTab === 'excerpt'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Sample Excerpt
              </button>
            </div>

            {/* Tab Body */}
            <div className="flex-1 text-sm text-slate-600 leading-relaxed space-y-4">
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <p>{book.description}</p>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-xs text-slate-400 block uppercase font-bold">Page Length</span>
                      <span className="font-bold text-slate-800">{book.pages} Pages</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-xs text-slate-400 block uppercase font-bold">Format</span>
                      <span className="font-bold text-slate-800">{book.format} (DRM Protected)</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-xs text-slate-400 block uppercase font-bold">Rating</span>
                      <span className="font-bold text-slate-800 flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        {book.rating.toFixed(1)} / 5.0 ({book.reviewCount} student reviews)
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-xs text-slate-400 block uppercase font-bold">Faculty</span>
                      <span className="font-bold text-slate-800">{book.faculty}</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'toc' && (
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Course Syllabus Table of Contents
                  </h4>
                  <ul className="space-y-2">
                    {book.tableOfContents.map((chap, idx) => (
                      <li key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-medium text-slate-700 flex items-center gap-3">
                        <span className="w-6 h-6 rounded bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span>{chap}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeTab === 'excerpt' && (
                <div className="space-y-3">
                  <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200 font-serif text-slate-800 italic leading-relaxed">
                    "{book.sampleExcerpt}"
                  </div>
                  <p className="text-xs text-slate-500 italic">
                    Note: Complete text available immediately upon purchase or via university library subscription pass.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
