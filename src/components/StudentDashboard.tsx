import React, { useState, useEffect } from 'react';
import { BookOpen, Bookmark, ShoppingBag, Download, Clock, CreditCard, Sparkles, Smartphone, CheckCircle, ArrowRight, Shield, PlusCircle, History, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Book, Purchase, WalletTransaction } from '../types';
import { MOCK_BOOKS } from '../data/mockBooks';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface StudentDashboardProps {
  onOpenBook: (book: Book) => void;
  onOpenReader: (book: Book) => void;
  onNavigateToBookstore: () => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  onOpenBook,
  onOpenReader,
  onNavigateToBookstore,
}) => {
  const { userProfile, loading, refreshUserProfile } = useAuth();
  const [purchasedBooks, setPurchasedBooks] = useState<Book[]>(MOCK_BOOKS.slice(0, 3));
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [activeTab, setActiveTab] = useState<'library' | 'transactions'>('library');

  // Fund Wallet State
  const [showFundModal, setShowFundModal] = useState(false);
  const [fundAmount, setFundAmount] = useState(5000);
  const [paymentPhase, setPaymentPhase] = useState<'idle' | 'initiating' | 'pending_payment' | 'verification_pending' | 'success' | 'failed'>('idle');
  const [activeTxRef, setActiveTxRef] = useState<string>('');
  const [activeFlwId, setActiveFlwId] = useState<string>('');
  const [fundError, setFundError] = useState<string | null>(null);
  const [successDetails, setSuccessDetails] = useState<{ amount: number; balance: number; ref: string } | null>(null);

  // Manual Status Check State
  const [lookupRef, setLookupRef] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Transactions State
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Fetch Purchased Books
  useEffect(() => {
    async function fetchPurchases() {
      if (userProfile?.uid) {
        setLoadingPurchases(true);
        try {
          const q = query(collection(db, 'purchases'), where('studentUid', '==', userProfile.uid));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const purchasedIds = snap.docs.map(doc => doc.data().bookId);
            const userBooks = MOCK_BOOKS.filter(b => purchasedIds.includes(b.id));
            if (userBooks.length > 0) {
              setPurchasedBooks(userBooks);
            }
          }
        } catch (err) {
          console.warn('Purchases fetch notice:', err);
        } finally {
          setLoadingPurchases(false);
        }
      }
    }
    fetchPurchases();
  }, [userProfile]);

  // Real-time Firestore Subscription for Wallet Transactions
  useEffect(() => {
    if (!userProfile?.uid) return;

    setLoadingTransactions(true);

    try {
      const q = query(
        collection(db, 'walletTransactions'),
        where('uid', '==', userProfile.uid)
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const txs: WalletTransaction[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            txs.push({
              id: docSnap.id,
              uid: data.uid,
              reference: data.reference || docSnap.id,
              flutterwaveTransactionId: data.flutterwaveTransactionId || '',
              amount: data.amount || 0,
              currency: data.currency || 'NGN',
              type: data.type || 'WALLET_FUNDING',
              status: data.status || 'SUCCESS',
              paymentProvider: data.paymentProvider || 'FLUTTERWAVE',
              createdAt: data.createdAt || new Date().toISOString(),
              verifiedAt: data.verifiedAt,
              description: data.description || 'CampusRead Wallet Transaction'
            });
          });

          // Sort by creation date descending
          txs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          if (txs.length > 0) {
            setTransactions(txs);
          } else {
            fetchServerTransactions(userProfile.uid);
          }
          setLoadingTransactions(false);
        },
        (err) => {
          console.warn('Firestore walletTransactions listener notice:', err);
          fetchServerTransactions(userProfile.uid);
          setLoadingTransactions(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.warn('Error setting up wallet transactions subscription:', err);
      fetchServerTransactions(userProfile.uid);
      setLoadingTransactions(false);
    }
  }, [userProfile?.uid]);

  const fetchServerTransactions = async (uid: string) => {
    try {
      const res = await fetch(`/api/wallet/transactions/${encodeURIComponent(uid)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.transactions && Array.isArray(data.transactions)) {
          setTransactions(data.transactions);
        }
      }
    } catch (err) {
      console.warn('Server transaction fetch notice:', err);
    }
  };

  const handleInitiateFunding = async () => {
    if (fundAmount < 100) {
      setFundError('Minimum wallet funding amount is ₦100.');
      return;
    }
    if (!userProfile?.uid) {
      setFundError('Please log in to fund your student wallet.');
      return;
    }

    setFundError(null);
    setPaymentPhase('initiating');

    try {
      const txRef = `CR-WAL-${userProfile.uid.slice(0, 5)}-${Date.now()}`;
      setActiveTxRef(txRef);
      const publicKey = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY || "FLWPUBK_TEST-52a13e2f42a5c9f538e1b21234a-X";

      // If Flutterwave inline checkout is available in window
      if (typeof (window as any).FlutterwaveCheckout === 'function') {
        setPaymentPhase('pending_payment');
        (window as any).FlutterwaveCheckout({
          public_key: publicKey,
          tx_ref: txRef,
          amount: fundAmount,
          currency: "NGN",
          payment_options: "card,banktransfer,ussd",
          customer: {
            email: userProfile.email || "student@campusread.com.ng",
            name: userProfile.fullName || "CampusRead Student",
          },
          meta: {
            studentUid: userProfile.uid,
            accountType: "STUDENT",
            purpose: "WALLET_FUNDING"
          },
          customizations: {
            title: "CampusRead Student Wallet Funding",
            description: `Top-up student wallet with ₦${fundAmount.toLocaleString()}`,
            logo: "https://campusread.com.ng/logo.png",
          },
          callback: async (response: any) => {
            const flwId = String(response.transaction_id || response.id || txRef);
            setActiveFlwId(flwId);
            // CRITICAL: Immediately show Verification Pending state.
            // Never credit frontend directly until server verification succeeds.
            setPaymentPhase('verification_pending');
            await verifyTransactionWithServer(flwId, txRef, fundAmount);
          },
          onclose: () => {
            // If user closed without finishing callback, only revert to idle if not already verifying
            setPaymentPhase((prev) => (prev === 'pending_payment' || prev === 'initiating' ? 'idle' : prev));
          },
        });
      } else {
        // Direct fallback verification flow
        setPaymentPhase('verification_pending');
        await verifyTransactionWithServer(txRef, txRef, fundAmount);
      }
    } catch (err: any) {
      console.error('Wallet funding initiation error:', err);
      setFundError(err.message || 'Error initializing Flutterwave payment.');
      setPaymentPhase('failed');
    }
  };

  const verifyTransactionWithServer = async (transactionId: string, txRef: string, amount: number) => {
    try {
      setPaymentPhase('verification_pending');
      setFundError(null);

      const res = await fetch('/api/wallet/verify-flutterwave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: String(transactionId),
          transactionRef: String(txRef),
          studentUid: userProfile?.uid,
          expectedAmount: amount
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setFundError(data.message || 'Payment verification failed. Your wallet was not modified.');
        setPaymentPhase('failed');
        return;
      }

      // Successful authoritative server verification
      setSuccessDetails({
        amount: data.verifiedAmount || amount,
        balance: data.walletBalance,
        ref: txRef
      });
      setPaymentPhase('success');

      // Refresh user profile and transactions
      if (refreshUserProfile) {
        await refreshUserProfile();
      }

      if (userProfile?.uid) {
        fetchServerTransactions(userProfile.uid);
      }

    } catch (err: any) {
      console.error('Server verification error:', err);
      setFundError('Unable to connect to verification server. You can click "Check Payment Status" to retry.');
      setPaymentPhase('failed');
    }
  };

  const handleRetryVerification = async () => {
    if (!activeTxRef && !activeFlwId) {
      setPaymentPhase('idle');
      return;
    }
    await verifyTransactionWithServer(activeFlwId || activeTxRef, activeTxRef, fundAmount);
  };

  const handleManualLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupRef.trim()) return;

    setIsLookingUp(true);
    setLookupMessage(null);

    try {
      const res = await fetch(`/api/wallet/check-status/${encodeURIComponent(lookupRef.trim())}?studentUid=${encodeURIComponent(userProfile?.uid || '')}`);
      const data = await res.json();

      if (data.success && data.status === 'SUCCESS') {
        setLookupMessage({
          type: 'success',
          text: `Verified: ${data.message} Balance: ₦${(data.walletBalance || 0).toLocaleString()}`
        });
        if (refreshUserProfile) await refreshUserProfile();
        if (userProfile?.uid) fetchServerTransactions(userProfile.uid);
      } else {
        setLookupMessage({
          type: 'info',
          text: data.message || 'Transaction is pending or not found on Flutterwave gateway.'
        });
      }
    } catch (err: any) {
      setLookupMessage({
        type: 'error',
        text: 'Error checking transaction status with server.'
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-white border border-slate-200 rounded-2xl text-center shadow-sm space-y-4">
        <div className="w-8 h-8 border-4 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Loading Student Portal...</h3>
        <p className="text-xs text-slate-500">Please wait while your student library and wallet balance are loaded.</p>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-amber-50 border border-amber-200 rounded-2xl text-center shadow-sm space-y-3">
        <AlertCircle className="w-10 h-10 text-amber-600 mx-auto" />
        <h3 className="text-base font-bold text-amber-900">Student Account Required</h3>
        <p className="text-xs text-amber-800 leading-relaxed">
          Please login with your student matriculation number or email to access your personal digital library and textbook purchases.
        </p>
      </div>
    );
  }

  const currentWalletBalance = (userProfile as any)?.walletBalance || 0;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 lg:px-12 max-w-7xl mx-auto space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-950 to-slate-900 text-white p-6 lg:p-8 rounded-2xl shadow-lg border border-blue-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded uppercase">
              STUDENT PORTAL
            </span>
            <span className="text-xs text-blue-200">{userProfile?.institution || 'University Campus'}</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight font-serif">
            Welcome back, {userProfile?.fullName || 'Student'}!
          </h1>
          <p className="text-xs lg:text-sm text-slate-300">
            Matriculation No: <strong className="text-amber-300 font-mono">{(userProfile as any)?.matricNumber || '190408012'}</strong> • {(userProfile as any)?.department || 'Engineering'} • {(userProfile as any)?.level || '300 Level'}
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 text-right min-w-[220px] flex flex-col items-end gap-2">
          <div>
            <span className="text-[10px] text-blue-200 font-bold block uppercase tracking-wider">CampusRead Wallet</span>
            <span className="text-2xl font-black text-amber-400 font-mono">₦{currentWalletBalance.toLocaleString()}</span>
          </div>
          <button
            onClick={() => {
              setFundError(null);
              setPaymentPhase('idle');
              setShowFundModal(true);
            }}
            className="w-full py-2 px-3 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black rounded-lg shadow transition-colors flex items-center justify-center gap-1.5 active:scale-95"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>FUND WALLET</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white p-2 rounded-xl shadow-sm text-xs font-bold gap-2">
        <button
          onClick={() => setActiveTab('library')}
          className={`px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'library' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Bookmark className="w-4 h-4" />
          <span>My Library & Reading ({purchasedBooks.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'transactions' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Wallet Transactions ({transactions.length})</span>
        </button>
      </div>

      {/* APK Installation Option Prompt */}
      <div className="bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-slate-950 shrink-0 shadow-sm">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm">YOUR BOOKS ARE READY FOR OFFLINE READING</h3>
            <p className="text-xs text-slate-700 mt-0.5">
              Install the CampusRead app to enjoy protected offline reading anywhere, even without internet access.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="https://campusread.com.ng/download/campusread.apk"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold rounded-lg shadow transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>INSTALL CAMPUSREAD APP</span>
          </a>
        </div>
      </div>

      {activeTab === 'library' && (
        <>
          {/* Continue Reading Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-900" />
                <span>Continue Reading</span>
              </h2>
              <button onClick={onNavigateToBookstore} className="text-xs font-bold text-blue-900 hover:underline flex items-center gap-1">
                <span>Explore Bookstore</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {purchasedBooks.map((book) => (
                <div key={book.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="w-12 h-16 bg-gradient-to-br from-blue-800 to-indigo-950 rounded text-white flex items-center justify-center font-bold text-[10px] p-1 text-center shrink-0 shadow">
                      {book.courseCode || 'COURSE'}
                    </div>
                    <div className="space-y-1 flex-1">
                      <h3 className="font-bold text-slate-900 text-sm line-clamp-2 leading-tight">{book.title}</h3>
                      <p className="text-xs text-slate-500">{book.author}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-bold text-slate-600">
                      <span>Reading Progress</span>
                      <span className="text-blue-900">Active</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-blue-800 h-full w-[45%]" />
                    </div>
                  </div>

                  <button
                    onClick={() => onOpenReader(book)}
                    className="w-full py-2 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>READ NOW ONLINE</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* My Library Catalog */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-amber-500" />
                <span>My Purchased Digital Library</span>
              </h2>
              <span className="text-xs font-bold bg-blue-50 text-blue-900 px-3 py-1 rounded-full">
                {purchasedBooks.length} Books Owned
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {purchasedBooks.map((book) => (
                <div key={book.id} className="border border-slate-200 rounded-lg p-3 hover:border-blue-300 transition-colors space-y-2">
                  <div className="h-32 bg-slate-800 rounded text-white p-3 flex flex-col justify-between">
                    <span className="text-[10px] font-bold bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded self-start">
                      {book.format}
                    </span>
                    <p className="font-serif font-bold text-xs line-clamp-2">{book.title}</p>
                  </div>
                  <p className="text-xs font-bold text-slate-800 truncate">{book.title}</p>
                  <button
                    onClick={() => onOpenReader(book)}
                    className="w-full py-1.5 text-xs font-bold bg-slate-100 hover:bg-blue-900 hover:text-white rounded text-slate-700 transition-colors"
                  >
                    Open Reader
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* TRANSACTIONS TAB */}
      {activeTab === 'transactions' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Student Wallet Statement</h2>
              <p className="text-xs text-slate-500">View verified Flutterwave deposits, textbook purchases and ledger balance.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => userProfile?.uid && fetchServerTransactions(userProfile.uid)}
                className="p-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors text-xs font-medium flex items-center gap-1"
                title="Refresh Transactions"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={() => {
                  setFundError(null);
                  setPaymentPhase('idle');
                  setShowFundModal(true);
                }}
                className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Top Up Wallet</span>
              </button>
            </div>
          </div>

          {/* Quick Payment Status Check Tool */}
          <form onSubmit={handleManualLookup} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-900" />
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Check Pending Transaction Status</h4>
            </div>
            <p className="text-xs text-slate-600">
              If your payment completed on Flutterwave but was interrupted before confirmation, enter your reference or Flutterwave transaction ID below:
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="e.g. CR-WAL-19040-1724589000 or FLW-12345"
                value={lookupRef}
                onChange={(e) => setLookupRef(e.target.value)}
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-blue-900"
              />
              <button
                type="submit"
                disabled={isLookingUp || !lookupRef.trim()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                {isLookingUp ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Verify Status</span>
                )}
              </button>
            </div>
            {lookupMessage && (
              <div className={`p-2.5 rounded-lg text-xs font-medium ${
                lookupMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : lookupMessage.type === 'error'
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : 'bg-blue-50 text-blue-800 border border-blue-200'
              }`}>
                {lookupMessage.text}
              </div>
            )}
          </form>

          {loadingTransactions ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <div className="w-6 h-6 border-2 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs">Loading transaction history...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center space-y-3 bg-slate-50 rounded-xl border border-slate-100">
              <History className="w-10 h-10 text-slate-300 mx-auto" />
              <h4 className="text-sm font-bold text-slate-700">No Wallet Transactions Yet</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Fund your wallet to make instant, 1-click textbook purchases across the CampusRead academic bookstore.
              </p>
              <button
                onClick={() => {
                  setFundError(null);
                  setPaymentPhase('idle');
                  setShowFundModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-900 text-white rounded-lg text-xs font-bold hover:bg-blue-800 transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Fund Wallet Now</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {transactions.map((tx) => (
                <div key={tx.id} className="py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{tx.description}</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                        tx.type === 'WALLET_FUNDING' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-900'
                      }`}>
                        {tx.type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Ref: <span className="font-mono text-slate-700">{tx.reference}</span> • {new Date(tx.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className={`text-base font-extrabold font-mono ${
                      tx.amount > 0 ? 'text-emerald-600' : 'text-slate-900'
                    }`}>
                      {tx.amount > 0 ? `+₦${tx.amount.toLocaleString()}` : `-₦${Math.abs(tx.amount).toLocaleString()}`}
                    </span>
                    <span className="block text-[10px] font-bold text-emerald-700 uppercase">
                      {tx.status} • {tx.paymentProvider}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FUND WALLET MODAL */}
      {showFundModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-900" />
                <h3 className="font-bold text-slate-900 text-base">Fund Student Wallet</h3>
              </div>
              <button
                onClick={() => paymentPhase !== 'verification_pending' && setShowFundModal(false)}
                disabled={paymentPhase === 'verification_pending'}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1 leading-none disabled:opacity-50"
              >
                &times;
              </button>
            </div>

            {paymentPhase === 'verification_pending' ? (
              <div className="p-6 bg-blue-50 border border-blue-200 rounded-xl text-center space-y-4">
                <div className="w-12 h-12 border-4 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto" />
                <div className="space-y-1.5">
                  <h4 className="font-bold text-blue-950 text-base">Verifying Transaction...</h4>
                  <p className="text-xs text-blue-800 leading-relaxed font-medium">
                    Payment received. We are verifying your transaction. Your wallet will be credited after verification.
                  </p>
                </div>
                {activeTxRef && (
                  <div className="bg-white/80 p-2.5 rounded-lg border border-blue-200 text-[11px] font-mono text-slate-700">
                    Ref: <span className="font-bold">{activeTxRef}</span>
                  </div>
                )}
                <p className="text-[10px] text-slate-500">
                  Please do not close this window while Flutterwave gateway verification is in progress.
                </p>
              </div>
            ) : paymentPhase === 'success' ? (
              <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-4">
                <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto animate-bounce" />
                <div>
                  <h4 className="font-bold text-emerald-900 text-base">Wallet Funded Successfully!</h4>
                  <p className="text-xs text-emerald-700 mt-1">
                    ₦{(successDetails?.amount || fundAmount).toLocaleString()} has been independently verified and credited to your CampusRead wallet.
                  </p>
                </div>
                <div className="bg-white/90 p-3 rounded-lg border border-emerald-200 text-xs font-mono font-bold text-emerald-900">
                  New Wallet Balance: ₦{(successDetails?.balance || currentWalletBalance).toLocaleString()}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowFundModal(false);
                    setPaymentPhase('idle');
                  }}
                  className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            ) : paymentPhase === 'failed' ? (
              <div className="p-6 bg-red-50 border border-red-200 rounded-xl space-y-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-8 h-8 text-red-600 shrink-0" />
                  <div>
                    <h4 className="font-bold text-red-900 text-sm">Payment Verification Notice</h4>
                    <p className="text-xs text-red-700 mt-0.5">
                      {fundError || 'Unable to confirm transaction with Flutterwave.'}
                    </p>
                  </div>
                </div>

                {activeTxRef && (
                  <div className="bg-white p-2.5 rounded border border-red-200 text-xs font-mono text-slate-700">
                    Ref: <span className="font-bold">{activeTxRef}</span>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleRetryVerification}
                    className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Check Payment Status & Retry Verification</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentPhase('idle');
                      setFundError(null);
                    }}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors"
                  >
                    Try Another Amount
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Enter the amount you wish to add to your CampusRead wallet. Payments are securely processed and verified via <strong>Flutterwave</strong> (Debit Card, Bank Transfer, USSD).
                </p>

                {fundError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2 font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{fundError}</span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  {[1000, 2000, 5000, 10000, 20000, 50000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setFundAmount(amt)}
                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                        fundAmount === amt ? 'bg-blue-900 text-white border-blue-900 shadow-sm' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      ₦{amt.toLocaleString()}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Custom Amount (₦)</label>
                  <input
                    type="number"
                    min="100"
                    step="500"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(Math.max(0, Number(e.target.value)))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold text-slate-900 outline-none focus:border-blue-900 transition-colors"
                  />
                </div>

                <button
                  type="button"
                  disabled={paymentPhase === 'initiating' || fundAmount < 100}
                  onClick={handleInitiateFunding}
                  className="w-full py-3 bg-blue-900 hover:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-2 active:scale-98"
                >
                  {paymentPhase === 'initiating' ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Initiating Payment...</span>
                    </div>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      <span>CONTINUE TO PAYMENT (₦{fundAmount.toLocaleString()})</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-2 pt-2 text-[10px] text-slate-400">
                  <Shield className="w-3 h-3 text-emerald-600" />
                  <span>256-Bit SSL Encrypted & Verified by Flutterwave</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
