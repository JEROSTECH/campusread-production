import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBoRpDErIy7y1R0aXlPWNREg4mcO5DMd4k",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "campusread-f8102.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "campusread-f8102",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "869680208660",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:869680208660:web:8aa9fad739167c00b28001",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-784GKECGTF"
};

// Initialize Firebase App singleton (Spark Tier Auth + Firestore only)
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Campus Read Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connectivity verification check
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'settings', 'appSettings'));
    console.log('Connected to Campus Read Firestore backend successfully.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Campus Read Firebase is running in offline mode or waiting for connection.');
    }
  }
}

testConnection();
