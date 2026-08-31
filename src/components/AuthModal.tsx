import React, { useState, useEffect } from 'react';
import { X, Lock, Mail, BookOpen, Shield, AlertCircle, CheckCircle, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useAuth, translateFirebaseAuthError } from '../context/AuthContext';
import { INSTITUTIONS } from '../data/mockBooks';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  initialRegisterRole?: 'STUDENT' | 'LECTURER' | 'AFFILIATE';
  onClose: () => void;
  onSuccessRedirect?: (role: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  initialRegisterRole = 'STUDENT',
  onClose,
  onSuccessRedirect,
}) => {
  const { 
    registerStudent, 
    registerLecturer, 
    registerAffiliate, 
    loginUser,
    resetPassword,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot_password'>(initialMode);
  
  // Registration Role Tabs: ONLY shown on the REGISTRATION screen ('STUDENT' | 'LECTURER' | 'AFFILIATE')
  // Super Admin is NEVER registerable.
  const [registerRole, setRegisterRole] = useState<'STUDENT' | 'LECTURER' | 'AFFILIATE'>(initialRegisterRole);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sync state when modal is opened
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setRegisterRole(initialRegisterRole || 'STUDENT');
      setErrorMsg(null);
      setSuccessMsg(null);
      setShowPassword(false);
      setShowConfirmPassword(false);
    }
  }, [isOpen, initialMode, initialRegisterRole]);

  // Unified Login Inputs (No role state)
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');

  // Student Register Form
  const [studentForm, setStudentForm] = useState({
    fullName: '',
    matricNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
    institution: INSTITUTIONS[1]?.name || 'University of Lagos (UNILAG)',
    faculty: 'Engineering',
    department: 'Mechanical Engineering',
    level: '100 Level',
  });

  // Lecturer Register Form
  const [lecturerForm, setLecturerForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    title: 'Dr.',
    institution: INSTITUTIONS[1]?.name || 'University of Lagos (UNILAG)',
    faculty: 'Engineering',
    department: 'Electrical Engineering',
    phone: '',
    bankName: 'First Bank of Nigeria',
    accountNumber: '',
    accountName: '',
  });

  // Affiliate Register Form
  const [affiliateForm, setAffiliateForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    bankName: 'GTBank',
    accountNumber: '',
    accountName: '',
  });

  // Unified Single Login Submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      // Authenticates via Firebase, reads authoritative users/{uid} from Firestore, and resolves role
      const verifiedProfile = await loginUser(loginIdentifier, loginPassword);
      onSuccessRedirect?.(verifiedProfile.role);
      onClose();
    } catch (err: any) {
      setErrorMsg(translateFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Forgot Password Submission
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      await resetPassword(resetEmail);
      setSuccessMsg(`Password reset link sent to ${resetEmail}. Please check your email inbox.`);
    } catch (err: any) {
      setErrorMsg(translateFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Registration Submission (Student / Lecturer / Affiliate)
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      if (registerRole === 'STUDENT') {
        if (!studentForm.fullName.trim()) throw new Error('Full Name cannot be empty.');
        if (!studentForm.matricNumber.trim()) throw new Error('Matriculation Number cannot be empty.');
        if (studentForm.password.length < 6) throw new Error('Password must be at least 6 characters.');
        if (studentForm.password !== studentForm.confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        await registerStudent(studentForm);
        setSuccessMsg('Student registration successful! Verification email sent.');
        onSuccessRedirect?.('STUDENT');
      } else if (registerRole === 'LECTURER') {
        if (!lecturerForm.fullName.trim()) throw new Error('Full Name cannot be empty.');
        if (lecturerForm.password.length < 6) throw new Error('Password must be at least 6 characters.');
        if (lecturerForm.password !== lecturerForm.confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        await registerLecturer(lecturerForm);
        setSuccessMsg('Lecturer registration successful!');
        onSuccessRedirect?.('LECTURER');
      } else if (registerRole === 'AFFILIATE') {
        if (!affiliateForm.fullName.trim()) throw new Error('Full Name cannot be empty.');
        if (affiliateForm.password.length < 6) throw new Error('Password must be at least 6 characters.');
        if (affiliateForm.password !== affiliateForm.confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        await registerAffiliate(affiliateForm);
        setSuccessMsg('Affiliate registration successful!');
        onSuccessRedirect?.('AFFILIATE');
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(translateFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div id="auth-modal-overlay" className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div id="auth-modal-card" className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full relative overflow-hidden my-6">
        <button
          id="close-auth-modal-btn"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-12 min-h-[480px]">
          {/* Left Visual Branding Panel (Responsive Desktop) */}
          <div className="hidden md:flex md:col-span-5 bg-gradient-to-b from-blue-900 via-blue-950 to-slate-900 text-white p-8 flex-col justify-between relative overflow-hidden">
            <div className="space-y-4 relative z-10">
              <div className="w-10 h-10 bg-amber-400 text-slate-950 font-black text-sm rounded-xl flex items-center justify-center shadow-lg">
                CR
              </div>
              <h3 className="text-2xl font-black font-serif leading-tight text-white">
                CAMPUS READ
              </h3>
              <p className="text-xs text-blue-200 leading-relaxed font-medium">
                Nigeria's verified digital academic portal for textbooks, lab manuals & 10-year examination past questions.
              </p>
            </div>

            <div className="space-y-3 relative z-10 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Protected Reading Engine</span>
              </div>
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Faculty Verified Textbooks</span>
              </div>
            </div>

            <div className="text-[10px] text-blue-300 border-t border-blue-800/80 pt-3 relative z-10 font-bold">
              Read. Learn. Pass. Anywhere.
            </div>
          </div>

          {/* Right Form Content Panel */}
          <div className="col-span-1 md:col-span-7 p-6 lg:p-8 flex flex-col justify-center space-y-4">
            {/* Header Title */}
            <div className="text-center md:text-left space-y-1">
              <div className="text-[11px] font-extrabold tracking-widest text-amber-600 uppercase">
                CAMPUS READ
              </div>
              <h2 className="text-xl lg:text-2xl font-black text-slate-900 font-serif tracking-tight">
                {mode === 'login' ? 'Account Login' : mode === 'register' ? 'Create Account' : 'Reset Password'}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {mode === 'login'
                  ? 'Enter your login credentials to access your account.'
                  : mode === 'register'
                  ? 'Select your account type below to register.'
                  : 'Enter your account email address to receive password reset instructions.'}
              </p>
            </div>

            {/* Mode Switch Tabs (Login vs Register) */}
            {mode !== 'forgot_password' && (
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  id="tab-mode-login"
                  type="button"
                  onClick={() => { setMode('login'); setErrorMsg(null); setSuccessMsg(null); }}
                  className={`flex-1 py-2 text-xs font-extrabold rounded-lg transition-all ${
                    mode === 'login' ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  LOGIN
                </button>
                <button
                  id="tab-mode-register"
                  type="button"
                  onClick={() => { setMode('register'); setErrorMsg(null); setSuccessMsg(null); }}
                  className={`flex-1 py-2 text-xs font-extrabold rounded-lg transition-all ${
                    mode === 'register' ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  CREATE ACCOUNT
                </button>
              </div>
            )}

            {/* Account Type Selector — ONLY ON REGISTRATION SCREEN (Super Admin is NEVER registerable) */}
            {mode === 'register' && (
              <div id="register-role-tabs" className="flex border-b border-slate-200 overflow-x-auto pb-1 text-xs font-bold gap-1">
                <button
                  id="register-tab-student"
                  type="button"
                  onClick={() => setRegisterRole('STUDENT')}
                  className={`px-3 py-1.5 border-b-2 transition-colors whitespace-nowrap ${
                    registerRole === 'STUDENT' ? 'border-blue-800 text-blue-900 font-extrabold' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Student
                </button>
                <button
                  id="register-tab-lecturer"
                  type="button"
                  onClick={() => setRegisterRole('LECTURER')}
                  className={`px-3 py-1.5 border-b-2 transition-colors whitespace-nowrap ${
                    registerRole === 'LECTURER' ? 'border-blue-800 text-blue-900 font-extrabold' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Lecturer / Author
                </button>
                <button
                  id="register-tab-affiliate"
                  type="button"
                  onClick={() => setRegisterRole('AFFILIATE')}
                  className={`px-3 py-1.5 border-b-2 transition-colors whitespace-nowrap ${
                    registerRole === 'AFFILIATE' ? 'border-blue-800 text-blue-900 font-extrabold' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Affiliate
                </button>
              </div>
            )}

            {/* Error & Success Alert Banners */}
            {errorMsg && (
              <div id="auth-error-alert" className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs font-medium rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div id="auth-success-alert" className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-lg flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* 1. FORGOT PASSWORD FORM */}
            {mode === 'forgot_password' ? (
              <form id="forgot-password-form" onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Account Email Address</label>
                  <input
                    id="reset-email-input"
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="your.email@university.edu.ng"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:border-blue-600 outline-none"
                  />
                </div>

                <button
                  id="submit-reset-password-btn"
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-blue-900 hover:bg-blue-950 text-white font-extrabold text-xs rounded-lg shadow transition-all cursor-pointer"
                >
                  {submitting ? 'Sending Reset Email...' : 'Send Password Reset Email'}
                </button>

                <button
                  id="back-to-login-btn"
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-xs font-bold text-slate-600 hover:text-blue-900 flex items-center gap-1 mx-auto pt-2 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Login</span>
                </button>
              </form>
            ) : mode === 'login' ? (
              /* 2. SINGLE UNIFIED LOGIN FORM — ABSOLUTELY NO ROLE TABS OR ROLE BUTTONS */
              <form id="unified-login-form" onSubmit={handleLoginSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address or Matriculation Number
                  </label>
                  <input
                    id="login-identifier-input"
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="e.g. student@unilag.edu.ng or 190408012"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:border-blue-600 outline-none text-slate-900"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Students can use their Email Address or Matriculation Number. Other users use their Email Address.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-slate-700">Password</label>
                    <button
                      id="forgot-password-link"
                      type="button"
                      onClick={() => setMode('forgot_password')}
                      className="text-[11px] font-bold text-blue-700 hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="login-password-input"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:border-blue-600 outline-none text-slate-900"
                    />
                    <button
                      id="toggle-login-password-btn"
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  id="submit-login-btn"
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-blue-900 hover:bg-blue-950 text-white font-extrabold text-xs rounded-lg shadow-md shadow-blue-900/20 transition-all cursor-pointer"
                >
                  {submitting ? 'Authenticating...' : 'LOGIN'}
                </button>
              </form>
            ) : (
              /* 3. REGISTRATION FORMS (Student, Lecturer, Affiliate only) */
              <form id="registration-form" onSubmit={handleRegisterSubmit} className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                {registerRole === 'STUDENT' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                      <input
                        id="student-fullname-input"
                        type="text"
                        required
                        value={studentForm.fullName}
                        onChange={(e) => setStudentForm({ ...studentForm, fullName: e.target.value })}
                        placeholder="e.g. Chukwuemeka Emmanuel"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:bg-white focus:border-blue-600"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Matric Number</label>
                        <input
                          id="student-matric-input"
                          type="text"
                          required
                          value={studentForm.matricNumber}
                          onChange={(e) => setStudentForm({ ...studentForm, matricNumber: e.target.value })}
                          placeholder="e.g. 190408012"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:bg-white focus:border-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Student Email</label>
                        <input
                          id="student-email-input"
                          type="email"
                          required
                          value={studentForm.email}
                          onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
                          placeholder="student@unilag.edu.ng"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:bg-white focus:border-blue-600"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Institution</label>
                      <select
                        id="student-institution-select"
                        value={studentForm.institution}
                        onChange={(e) => setStudentForm({ ...studentForm, institution: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                      >
                        {INSTITUTIONS.filter(i => i.id !== 'all').map((inst) => (
                          <option key={inst.id} value={inst.name}>{inst.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Faculty</label>
                        <input
                          id="student-faculty-input"
                          type="text"
                          required
                          value={studentForm.faculty}
                          onChange={(e) => setStudentForm({ ...studentForm, faculty: e.target.value })}
                          placeholder="e.g. Engineering"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                        <input
                          id="student-department-input"
                          type="text"
                          required
                          value={studentForm.department}
                          onChange={(e) => setStudentForm({ ...studentForm, department: e.target.value })}
                          placeholder="e.g. Mechanical"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                        <input
                          id="student-password-input"
                          type="password"
                          required
                          value={studentForm.password}
                          onChange={(e) => setStudentForm({ ...studentForm, password: e.target.value })}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Confirm Password</label>
                        <input
                          id="student-confirmpassword-input"
                          type="password"
                          required
                          value={studentForm.confirmPassword}
                          onChange={(e) => setStudentForm({ ...studentForm, confirmPassword: e.target.value })}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                {registerRole === 'LECTURER' && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Title</label>
                        <select
                          id="lecturer-title-select"
                          value={lecturerForm.title}
                          onChange={(e) => setLecturerForm({ ...lecturerForm, title: e.target.value })}
                          className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                        >
                          <option value="Prof.">Prof.</option>
                          <option value="Dr.">Dr.</option>
                          <option value="Engr.">Engr.</option>
                          <option value="Barr.">Barr.</option>
                          <option value="Mr.">Mr.</option>
                          <option value="Mrs.">Mrs.</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                        <input
                          id="lecturer-fullname-input"
                          type="text"
                          required
                          value={lecturerForm.fullName}
                          onChange={(e) => setLecturerForm({ ...lecturerForm, fullName: e.target.value })}
                          placeholder="e.g. Babatunde Adeyemi"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Official Email</label>
                        <input
                          id="lecturer-email-input"
                          type="email"
                          required
                          value={lecturerForm.email}
                          onChange={(e) => setLecturerForm({ ...lecturerForm, email: e.target.value })}
                          placeholder="adeyemi@unilag.edu.ng"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                        <input
                          id="lecturer-phone-input"
                          type="text"
                          required
                          value={lecturerForm.phone}
                          onChange={(e) => setLecturerForm({ ...lecturerForm, phone: e.target.value })}
                          placeholder="08031234567"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Institution</label>
                      <select
                        id="lecturer-institution-select"
                        value={lecturerForm.institution}
                        onChange={(e) => setLecturerForm({ ...lecturerForm, institution: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                      >
                        {INSTITUTIONS.filter(i => i.id !== 'all').map((inst) => (
                          <option key={inst.id} value={inst.name}>{inst.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="p-2.5 bg-blue-50/70 rounded-lg border border-blue-100 space-y-1.5">
                      <span className="text-[11px] font-bold text-blue-900 block">Bank Account for Royalties Payout</span>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          id="lecturer-bank-input"
                          type="text"
                          required
                          value={lecturerForm.bankName}
                          onChange={(e) => setLecturerForm({ ...lecturerForm, bankName: e.target.value })}
                          placeholder="Bank Name"
                          className="px-2 py-1.5 bg-white border border-slate-200 rounded text-xs"
                        />
                        <input
                          id="lecturer-accountnum-input"
                          type="text"
                          required
                          value={lecturerForm.accountNumber}
                          onChange={(e) => setLecturerForm({ ...lecturerForm, accountNumber: e.target.value })}
                          placeholder="0123456789"
                          className="px-2 py-1.5 bg-white border border-slate-200 rounded text-xs"
                        />
                        <input
                          id="lecturer-accountname-input"
                          type="text"
                          required
                          value={lecturerForm.accountName}
                          onChange={(e) => setLecturerForm({ ...lecturerForm, accountName: e.target.value })}
                          placeholder="Account Name"
                          className="px-2 py-1.5 bg-white border border-slate-200 rounded text-xs"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                        <input
                          id="lecturer-password-input"
                          type="password"
                          required
                          value={lecturerForm.password}
                          onChange={(e) => setLecturerForm({ ...lecturerForm, password: e.target.value })}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Confirm Password</label>
                        <input
                          id="lecturer-confirmpassword-input"
                          type="password"
                          required
                          value={lecturerForm.confirmPassword}
                          onChange={(e) => setLecturerForm({ ...lecturerForm, confirmPassword: e.target.value })}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                {registerRole === 'AFFILIATE' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                      <input
                        id="affiliate-fullname-input"
                        type="text"
                        required
                        value={affiliateForm.fullName}
                        onChange={(e) => setAffiliateForm({ ...affiliateForm, fullName: e.target.value })}
                        placeholder="e.g. Blessing Okon"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                        <input
                          id="affiliate-email-input"
                          type="email"
                          required
                          value={affiliateForm.email}
                          onChange={(e) => setAffiliateForm({ ...affiliateForm, email: e.target.value })}
                          placeholder="affiliate@gmail.com"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                        <input
                          id="affiliate-phone-input"
                          type="text"
                          required
                          value={affiliateForm.phone}
                          onChange={(e) => setAffiliateForm({ ...affiliateForm, phone: e.target.value })}
                          placeholder="08039876543"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                        />
                      </div>
                    </div>
                    <div className="p-2.5 bg-emerald-50/70 rounded-lg border border-emerald-100 space-y-1.5">
                      <span className="text-[11px] font-bold text-emerald-900 block">Bank Account for Commission Payouts</span>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          id="affiliate-bank-input"
                          type="text"
                          required
                          value={affiliateForm.bankName}
                          onChange={(e) => setAffiliateForm({ ...affiliateForm, bankName: e.target.value })}
                          placeholder="Bank Name"
                          className="px-2 py-1.5 bg-white border border-slate-200 rounded text-xs"
                        />
                        <input
                          id="affiliate-accountnum-input"
                          type="text"
                          required
                          value={affiliateForm.accountNumber}
                          onChange={(e) => setAffiliateForm({ ...affiliateForm, accountNumber: e.target.value })}
                          placeholder="0123456789"
                          className="px-2 py-1.5 bg-white border border-slate-200 rounded text-xs"
                        />
                        <input
                          id="affiliate-accountname-input"
                          type="text"
                          required
                          value={affiliateForm.accountName}
                          onChange={(e) => setAffiliateForm({ ...affiliateForm, accountName: e.target.value })}
                          placeholder="Account Name"
                          className="px-2 py-1.5 bg-white border border-slate-200 rounded text-xs"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                        <input
                          id="affiliate-password-input"
                          type="password"
                          required
                          value={affiliateForm.password}
                          onChange={(e) => setAffiliateForm({ ...affiliateForm, password: e.target.value })}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Confirm Password</label>
                        <input
                          id="affiliate-confirmpassword-input"
                          type="password"
                          required
                          value={affiliateForm.confirmPassword}
                          onChange={(e) => setAffiliateForm({ ...affiliateForm, confirmPassword: e.target.value })}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                <button
                  id="submit-register-btn"
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-blue-900 hover:bg-blue-950 text-white font-extrabold text-xs rounded-lg shadow-md shadow-blue-900/20 transition-all mt-2 cursor-pointer"
                >
                  {submitting ? 'Creating Account...' : `REGISTER AS ${registerRole}`}
                </button>
              </form>
            )}

            <div className="text-[11px] text-slate-400 text-center pt-2">
              By continuing, you agree to Campus Read's Terms of Service & Privacy Policy.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
