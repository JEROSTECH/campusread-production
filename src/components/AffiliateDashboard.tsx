import React, { useState } from 'react';
import { DollarSign, Copy, Check, Users, ArrowUpRight, Banknote, Share2, Award, Sparkles, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const AffiliateDashboard: React.FC = () => {
  const { userProfile, loading } = useAuth();
  const [copied, setCopied] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState(2500);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  const affiliateCode = (userProfile as any)?.affiliateCode || 'CR-REF100';
  const referralUrl = `https://campusread.com.ng/?ref=${affiliateCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWithdrawalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawSubmitting(true);
    setWithdrawSuccess(false);

    try {
      await addDoc(collection(db, 'withdrawals'), {
        userUid: userProfile?.uid,
        userName: userProfile?.fullName,
        userRole: 'AFFILIATE',
        bankName: (userProfile as any)?.bankName || 'GTBank',
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
        <div className="w-8 h-8 border-4 border-emerald-800 border-t-transparent rounded-full animate-spin mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Loading Affiliate Portal...</h3>
        <p className="text-xs text-slate-500">Please wait while your referral links, clicks and commissions are loaded.</p>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-amber-50 border border-amber-200 rounded-2xl text-center shadow-sm space-y-3">
        <AlertCircle className="w-10 h-10 text-amber-600 mx-auto" />
        <h3 className="text-base font-bold text-amber-900">Affiliate Account Required</h3>
        <p className="text-xs text-amber-800 leading-relaxed">
          Please login with your affiliate partner credentials to access your unique tracking links and earnings dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 lg:px-12 max-w-7xl mx-auto space-y-8">
      {/* Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-slate-900 to-emerald-950 text-white p-6 lg:p-8 rounded-2xl shadow-lg border border-emerald-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <span className="bg-emerald-400 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded uppercase">
            STUDENT AFFILIATE PORTAL
          </span>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight font-serif">
            Welcome, {userProfile?.fullName || 'Affiliate Partner'}!
          </h1>
          <p className="text-xs text-emerald-200">
            Earn 10% commission on every academic book purchased through your unique link.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10">
          <div>
            <span className="text-[10px] text-emerald-200 block uppercase font-bold">Commission Balance</span>
            <span className="text-2xl font-black text-amber-400 font-mono">
              ₦{(userProfile as any)?.commissionBalance?.toLocaleString() || '18,500.00'}
            </span>
          </div>
        </div>
      </div>

      {/* Referral Link & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Referral Card */}
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">Your Unique Affiliate Tracking Link</h2>
          </div>
          <p className="text-xs text-slate-500">
            Share this link across WhatsApp course groups, faculty forums, and social media. When students click and purchase textbooks, commission is automatically credited to your wallet.
          </p>

          <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <input
              type="text"
              readOnly
              value={referralUrl}
              className="bg-transparent text-xs font-mono font-bold text-slate-800 flex-1 outline-none"
            />
            <button
              onClick={handleCopyLink}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-500 block font-bold">Affiliate Code</span>
              <span className="text-slate-900 font-mono font-extrabold text-sm">{affiliateCode}</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-500 block font-bold">Commission Rate</span>
              <span className="text-emerald-700 font-extrabold text-sm">10% Per Sale</span>
            </div>
          </div>
        </div>

        {/* Quick Withdraw Request */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Banknote className="w-5 h-5 text-amber-500" />
            <span>Payout Request</span>
          </h2>

          {withdrawSuccess && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg">
              Payout request submitted to Super Admin!
            </div>
          )}

          <form onSubmit={handleWithdrawalRequest} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Bank Name</label>
              <p className="bg-slate-100 p-2 rounded text-slate-800 font-medium">
                {(userProfile as any)?.bankName || 'GTBank'} ({(userProfile as any)?.accountNumber || '0123456789'})
              </p>
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Amount (₦)</label>
              <input
                type="number"
                required
                min={1000}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={withdrawSubmitting}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow"
            >
              {withdrawSubmitting ? 'Submitting...' : 'Request Payout'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
