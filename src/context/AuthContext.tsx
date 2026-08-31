import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { clearLocalPdfCache } from '../lib/pdfStorage';
import { UserProfile, StudentProfile, LecturerProfile, AffiliateProfile, SuperAdminProfile } from '../types';

export function translateFirebaseAuthError(error: any): string {
  if (!error) return 'An unexpected error occurred. Please try again.';
  const message = error.message || error.toString();
  const code = error.code || '';

  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'Your email/matriculation number or password is incorrect.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'This email address is already registered. Please login or use a different email.';
  }
  if (code === 'auth/weak-password') {
    return 'Password must be at least 6 characters with numbers or letters.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many failed attempts. Please wait a moment and try again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network connection issue. Please check your internet connection.';
  }
  if (message.includes('Matriculation Number')) {
    return message;
  }
  if (message.includes('Passwords do not match')) {
    return message;
  }
  return message.replace(/Firebase: /i, '').replace(/auth\//i, '');
}

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  registerStudent: (data: Omit<StudentProfile, 'uid' | 'role' | 'accountType' | 'walletBalance' | 'status' | 'createdAt'> & { password: string }) => Promise<StudentProfile>;
  registerLecturer: (data: Omit<LecturerProfile, 'uid' | 'role' | 'accountType' | 'earningsBalance' | 'status' | 'createdAt'> & { password: string }) => Promise<LecturerProfile>;
  registerAffiliate: (data: Omit<AffiliateProfile, 'uid' | 'role' | 'accountType' | 'commissionBalance' | 'affiliateCode' | 'status' | 'createdAt'> & { password: string }) => Promise<AffiliateProfile>;
  loginUser: (identifier: string, password: string) => Promise<UserProfile>;
  loginWithEmail: (email: string, password: string) => Promise<UserProfile>;
  loginWithMatric: (matricNumber: string, password: string) => Promise<UserProfile>;
  loginSuperAdmin: (email: string, password: string) => Promise<SuperAdminProfile>;
  resetPassword: (email: string) => Promise<void>;
  resendEmailVerificationLink: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
  refreshUserProfile: () => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Sync Firebase Auth user and Firestore Profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            setUserProfile(userDocSnap.data() as UserProfile);
          } else {
            setUserProfile(null);
          }
        } catch (error) {
          console.error("Profile sync error:", error);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshProfile = async (): Promise<UserProfile | null> => {
    if (auth.currentUser) {
      try {
        const userDocSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDocSnap.exists()) {
          const prof = userDocSnap.data() as UserProfile;
          setUserProfile(prof);
          return prof;
        } else {
          setUserProfile(null);
          return null;
        }
      } catch (err) {
        console.warn("Profile refresh error:", err);
        return null;
      }
    }
    setUserProfile(null);
    return null;
  };

  // 1. STUDENT Registration
  const registerStudent = async (data: Omit<StudentProfile, 'uid' | 'role' | 'accountType' | 'walletBalance' | 'status' | 'createdAt'> & { password: string }): Promise<StudentProfile> => {
    const rawMatric = data.matricNumber.trim().toUpperCase();
    const strippedMatric = rawMatric.replace(/[^A-Z0-9]/gi, ''); // e.g. CSC2024001

    // Check matric number uniqueness in Firestore
    const q1 = query(collection(db, 'users'), where('matricNumber', '==', rawMatric));
    const q2 = query(collection(db, 'users'), where('normalizedMatric', '==', strippedMatric));
    
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    if (!snap1.empty || !snap2.empty) {
      throw new Error(`Matriculation Number ${rawMatric} is already registered.`);
    }

    const userCred = await createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
    const uid = userCred.user.uid;

    // Send email verification
    try {
      await sendEmailVerification(userCred.user);
    } catch (e) {
      console.warn("Email verification send warning:", e);
    }

    const profile: StudentProfile & { normalizedMatric?: string } = {
      uid,
      fullName: data.fullName.trim(),
      email: data.email.trim().toLowerCase(),
      matricNumber: rawMatric,
      normalizedMatric: strippedMatric,
      institution: data.institution,
      faculty: data.faculty,
      department: data.department,
      level: data.level,
      role: 'STUDENT',
      accountType: 'STUDENT',
      walletBalance: 0.0,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'users', uid), profile);
      setUserProfile(profile);
      return profile;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
      throw err;
    }
  };

  // 2. LECTURER Registration
  const registerLecturer = async (data: Omit<LecturerProfile, 'uid' | 'role' | 'accountType' | 'earningsBalance' | 'status' | 'createdAt'> & { password: string }): Promise<LecturerProfile> => {
    const userCred = await createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
    const uid = userCred.user.uid;

    try {
      await sendEmailVerification(userCred.user);
    } catch (e) {
      console.warn("Email verification send warning:", e);
    }

    const profile: LecturerProfile = {
      uid,
      fullName: data.fullName.trim(),
      email: data.email.trim().toLowerCase(),
      title: data.title,
      institution: data.institution,
      faculty: data.faculty,
      department: data.department,
      phone: data.phone,
      bankName: data.bankName,
      accountNumber: data.accountNumber,
      accountName: data.accountName,
      role: 'LECTURER',
      accountType: 'LECTURER',
      earningsBalance: 0.0,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'users', uid), profile);
      setUserProfile(profile);
      return profile;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
      throw err;
    }
  };

  // 3. AFFILIATE Registration
  const registerAffiliate = async (data: Omit<AffiliateProfile, 'uid' | 'role' | 'accountType' | 'commissionBalance' | 'affiliateCode' | 'status' | 'createdAt'> & { password: string }): Promise<AffiliateProfile> => {
    const userCred = await createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
    const uid = userCred.user.uid;

    try {
      await sendEmailVerification(userCred.user);
    } catch (e) {
      console.warn("Email verification send warning:", e);
    }

    // Generate unique affiliate code e.g. CR-AF-8X92K
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const affiliateCode = `CR-AF-${randomSuffix}`;

    const profile: AffiliateProfile = {
      uid,
      fullName: data.fullName.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone,
      bankName: data.bankName,
      accountNumber: data.accountNumber,
      accountName: data.accountName,
      affiliateCode,
      role: 'AFFILIATE',
      accountType: 'AFFILIATE',
      commissionBalance: 0.0,
      totalReferralClicks: 0,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'users', uid), profile);
      setUserProfile(profile);
      return profile;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
      throw err;
    }
  };

  // 4. UNIFIED LOGIN via Email OR Matriculation Number & Password
  // Automatically resolves identifier type, authenticates with Firebase, loads authoritative Firestore profile, and returns verified role.
  const loginUser = async (identifier: string, password: string): Promise<UserProfile> => {
    const rawIdentifier = identifier.trim();
    if (!rawIdentifier) {
      throw new Error("Please enter your email address or matriculation number.");
    }
    if (!password) {
      throw new Error("Please enter your password.");
    }

    const isEmail = rawIdentifier.includes('@');

    if (isEmail) {
      try {
        const userCred = await signInWithEmailAndPassword(auth, rawIdentifier.toLowerCase(), password);
        const uid = userCred.user.uid;
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (!userSnap.exists()) {
          throw new Error("Your account was authenticated, but your CampusRead profile could not be loaded. Please contact the administrator.");
        }
        const prof = userSnap.data() as UserProfile;
        setUserProfile(prof);
        return prof;
      } catch (err) {
        throw new Error(translateFirebaseAuthError(err));
      }
    } else {
      // Matriculation Number Login
      const rawMatric = rawIdentifier.toUpperCase();
      const strippedMatric = rawMatric.replace(/[^A-Z0-9]/gi, '');

      const q1 = query(collection(db, 'users'), where('matricNumber', '==', rawMatric));
      const q2 = query(collection(db, 'users'), where('normalizedMatric', '==', strippedMatric));

      let querySnap = await getDocs(q1);
      if (querySnap.empty) {
        querySnap = await getDocs(q2);
      }

      if (querySnap.empty) {
        throw new Error(`No registered student account found for Matriculation Number: ${rawMatric}`);
      }

      const studentData = querySnap.docs[0].data() as StudentProfile;
      if (!studentData.email) {
        throw new Error("Student profile is missing an associated email address.");
      }

      try {
        const userCred = await signInWithEmailAndPassword(auth, studentData.email, password);
        const uid = userCred.user.uid;
        const userSnap = await getDoc(doc(db, 'users', uid));
        const prof = userSnap.exists() ? (userSnap.data() as UserProfile) : studentData;
        setUserProfile(prof);
        return prof;
      } catch (err) {
        throw new Error(translateFirebaseAuthError(err));
      }
    }
  };

  // Legacy wrappers mapped to authoritative login
  const loginWithEmail = async (email: string, password: string): Promise<UserProfile> => {
    return loginUser(email, password);
  };

  const loginWithMatric = async (matricNumber: string, password: string): Promise<UserProfile> => {
    return loginUser(matricNumber, password);
  };

  const loginSuperAdmin = async (email: string, password: string): Promise<SuperAdminProfile> => {
    const prof = await loginUser(email, password);
    if (prof.role !== 'SUPER_ADMIN' && prof.role !== 'ADMIN') {
      await signOut(auth);
      setUserProfile(null);
      throw new Error("Access Denied. This account does not have Super Admin privileges.");
    }
    return prof as SuperAdminProfile;
  };

  // 7. Reset Password
  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    } catch (err) {
      throw new Error(translateFirebaseAuthError(err));
    }
  };

  // 8. Resend Email Verification
  const resendEmailVerificationLink = async () => {
    if (auth.currentUser) {
      try {
        await sendEmailVerification(auth.currentUser);
      } catch (err) {
        throw new Error(translateFirebaseAuthError(err));
      }
    }
  };

  const logout = async () => {
    try {
      await clearLocalPdfCache();
    } catch (e) {
      console.warn("Cache clear error:", e);
    }
    await signOut(auth);
    setUserProfile(null);
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      userProfile,
      loading,
      registerStudent,
      registerLecturer,
      registerAffiliate,
      loginUser,
      loginWithEmail,
      loginWithMatric,
      loginSuperAdmin,
      resetPassword,
      resendEmailVerificationLink,
      logout,
      refreshProfile,
      refreshUserProfile: refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
