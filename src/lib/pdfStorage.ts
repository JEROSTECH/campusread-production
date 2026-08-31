import { Book } from '../types';
import { auth } from './firebase';

const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50MB maximum (Compliant with Spark free tier)
const DB_NAME = 'CampusReadPDFCache';
const STORE_NAME = 'pdf_binaries';

// In-Memory Session Cache (Zero persistence risk across browser close/logout)
const sessionMemoryCache = new Map<string, ArrayBuffer>();

// Initialize IndexedDB Cache for Offline / Fast DRM PDF Access
function openPdfDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Purges all cached PDF binaries on logout
 */
export async function clearLocalPdfCache(): Promise<void> {
  sessionMemoryCache.clear();
  try {
    const idb = await openPdfDatabase();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not clear local PDF cache:', err);
  }
}

export async function savePdfToLocalCache(key: string, data: ArrayBuffer): Promise<void> {
  const currentUid = auth.currentUser?.uid || 'guest';
  const scopedKey = `${currentUid}:${key}`;
  sessionMemoryCache.set(scopedKey, data);
  try {
    const idb = await openPdfDatabase();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(data, scopedKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not save PDF to local cache:', err);
  }
}

export async function getPdfFromLocalCache(key: string): Promise<ArrayBuffer | null> {
  const currentUid = auth.currentUser?.uid || 'guest';
  const scopedKey = `${currentUid}:${key}`;
  if (sessionMemoryCache.has(scopedKey)) {
    return sessionMemoryCache.get(scopedKey)!;
  }
  try {
    const idb = await openPdfDatabase();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(scopedKey);
      req.onsuccess = () => {
        if (req.result) {
          sessionMemoryCache.set(scopedKey, req.result);
        }
        resolve(req.result || null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not retrieve PDF from local cache:', err);
    return null;
  }
}

/**
 * Validate PDF file by size, extension, MIME type, and magic bytes (%PDF)
 */
export async function validatePdfFile(file: File): Promise<{ valid: boolean; error?: string }> {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  // 1. File Size Validation (Max 50MB)
  if (file.size > MAX_PDF_SIZE) {
    return { 
      valid: false, 
      error: `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of 50MB.` 
    };
  }

  if (file.size === 0) {
    return { valid: false, error: 'The selected file is empty (0 bytes).' };
  }

  // 2. Extension check
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.pdf')) {
    return { valid: false, error: 'File must have a .pdf extension.' };
  }

  // 3. MIME type check
  if (file.type && file.type !== 'application/pdf' && file.type !== 'application/x-pdf') {
    return { valid: false, error: 'File MIME type is not a valid PDF.' };
  }

  // 4. Magic Bytes Inspection (Read first 4 bytes for %PDF / 0x25, 0x50, 0x44, 0x46)
  try {
    const slice = file.slice(0, 4);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const isMagicValid = 
      bytes[0] === 0x25 && // %
      bytes[1] === 0x50 && // P
      bytes[2] === 0x44 && // D
      bytes[3] === 0x46;   // F

    if (!isMagicValid) {
      return { 
        valid: false, 
        error: 'Invalid file signature. The uploaded file is not a valid PDF document.' 
      };
    }
  } catch (err) {
    console.error('Magic byte validation error:', err);
    return { valid: false, error: 'Failed to verify PDF header signature.' };
  }

  return { valid: true };
}

/**
 * Sanitize filename to prevent directory traversal and special character injection
 */
export function sanitizeFileName(fileName: string): string {
  const clean = fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^_+|_+$/g, '');
  return clean || `material_${Date.now()}.pdf`;
}

export interface PdfUploadResult {
  fileStoragePath: string;
  storageIdentifier: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadStatus: 'UPLOADED' | 'FAILED';
  uploadedAt: string;
}

/**
 * Upload PDF to Hostinger/Server Protected Private Storage via Authenticated Express Backend
 */
export async function uploadPdfMaterial(
  file: File,
  lecturerUid: string,
  materialId: string,
  onProgress?: (percent: number) => void
): Promise<PdfUploadResult> {
  const validation = await validatePdfFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'PDF validation failed.');
  }

  if (onProgress) onProgress(20);

  // Read full ArrayBuffer and cache in local storage for instantaneous preview
  const arrayBuffer = await file.arrayBuffer();
  await savePdfToLocalCache(materialId, arrayBuffer);

  const safeName = sanitizeFileName(file.name);
  const storagePath = `materials/${lecturerUid}/${materialId}/${safeName}`;
  await savePdfToLocalCache(storagePath, arrayBuffer);

  if (onProgress) onProgress(50);

  // Create multipart FormData payload
  const formData = new FormData();
  formData.append('file', file, safeName);
  formData.append('lecturerUid', lecturerUid);
  formData.append('materialId', materialId);
  formData.append('userRole', 'LECTURER');

  // Obtain Firebase auth token if available
  const currentUser = auth.currentUser;
  let idToken = '';
  if (currentUser) {
    try {
      idToken = await currentUser.getIdToken();
    } catch (tokenErr) {
      console.warn('Could not retrieve Firebase ID token:', tokenErr);
    }
  }

  const response = await fetch('/api/materials/upload', {
    method: 'POST',
    headers: {
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      'x-user-uid': lecturerUid,
      'x-user-role': 'LECTURER',
    },
    body: formData
  });

  if (onProgress) onProgress(90);

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(errorJson.message || 'Failed to upload PDF material to server storage.');
  }

  const result = await response.json();
  if (onProgress) onProgress(100);

  return {
    fileStoragePath: result.metadata?.storageIdentifier || storagePath,
    storageIdentifier: result.metadata?.storageIdentifier || `${lecturerUid}/${materialId}/${safeName}`,
    fileName: file.name,
    fileSize: file.size,
    mimeType: 'application/pdf',
    uploadStatus: 'UPLOADED',
    uploadedAt: result.metadata?.uploadedAt || new Date().toISOString()
  };
}

/**
 * Retrieve authenticated PDF binary data for the DRM reader
 */
export async function getPdfDataForReader(
  book: Book,
  authContext?: { uid?: string; role?: string; matric?: string; purchaseRef?: string }
): Promise<ArrayBuffer | null> {
  // 1. Try local IndexedDB / session cache first
  if (book.fileStoragePath) {
    const cached = await getPdfFromLocalCache(book.fileStoragePath);
    if (cached) return cached;
  }

  const cachedById = await getPdfFromLocalCache(book.id);
  if (cachedById) return cachedById;

  // 2. Fetch authenticated binary from Express backend endpoint
  try {
    const currentUser = auth.currentUser;
    let idToken = '';
    if (currentUser) {
      try {
        idToken = await currentUser.getIdToken();
      } catch (tokenErr) {
        console.warn('ID token fetch error:', tokenErr);
      }
    }

    const uid = authContext?.uid || currentUser?.uid || 'student-viewer';
    const role = authContext?.role || 'STUDENT';
    const matric = authContext?.matric || '';
    const purchaseRef = authContext?.purchaseRef || '';

    const headers: Record<string, string> = {
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      'x-user-uid': uid,
      'x-user-role': role,
      ...(matric ? { 'x-student-matric': matric } : {}),
      ...(purchaseRef ? { 'x-purchase-ref': purchaseRef } : {})
    };

    const res = await fetch(`/api/materials/${encodeURIComponent(book.id)}/pdf`, {
      method: 'GET',
      headers
    });

    if (res.ok) {
      const buffer = await res.arrayBuffer();
      if (buffer && buffer.byteLength > 0) {
        await savePdfToLocalCache(book.id, buffer);
        if (book.fileStoragePath) {
          await savePdfToLocalCache(book.fileStoragePath, buffer);
        }
        return buffer;
      }
    } else {
      console.warn(`PDF retrieval from server endpoint returned HTTP ${res.status}`);
    }
  } catch (serverErr) {
    console.warn('Could not fetch PDF from server API:', serverErr);
  }

  return null;
}

/**
 * Generates an authentic educational PDF ArrayBuffer on the fly for demonstration or structured course packs
 */
export function generateSampleCoursePackPdf(book: Book): ArrayBuffer {
  // Construct a compliant, clean multi-page PDF 1.4 binary
  const title = book.title.replace(/[\r\n\(\)]/g, ' ');
  const author = (book.author || 'Faculty Lecturer').replace(/[\r\n\(\)]/g, ' ');
  const institution = (book.institution || 'CampusRead Partner University').replace(/[\r\n\(\)]/g, ' ');
  const courseCode = (book.courseCode || 'GEN101').replace(/[\r\n\(\)]/g, ' ');
  const excerpt = (book.sampleExcerpt || 'Comprehensive academic lecture materials, exercises, and study notes.').replace(/[\r\n\(\)]/g, ' ');

  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 6 0 R /Resources << /Font << /F1 7 0 R /F2 8 0 R >> >> >>
endobj
4 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 9 0 R /Resources << /Font << /F1 7 0 R /F2 8 0 R >> >> >>
endobj
5 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 10 0 R /Resources << /Font << /F1 7 0 R /F2 8 0 R >> >> >>
endobj
6 0 obj
<< /Length 420 >>
stream
BT
/F2 20 Tf
50 770 Td
(${title}) Tj
/F1 12 Tf
0 -30 Td
(Course Code: ${courseCode}  |  Institution: ${institution}) Tj
0 -20 Td
(Author: ${author}) Tj
0 -40 Td
(CAMPUSREAD PROTECTED ACADEMIC COURSE MATERIAL) Tj
0 -30 Td
(Overview & Introduction:) Tj
0 -20 Td
(${excerpt}) Tj
0 -40 Td
(This digital material is protected by CampusRead DRM copyright technology.) Tj
0 -20 Td
(All unauthorized reproduction, distribution, and printing are strictly prohibited.) Tj
ET
endstream
endobj
7 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
8 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj
9 0 obj
<< /Length 360 >>
stream
BT
/F2 16 Tf
50 770 Td
(Chapter 1: Theoretical Foundations and Principles) Tj
/F1 11 Tf
0 -30 Td
(In this module, students study the foundational concepts governing ${courseCode}.) Tj
0 -25 Td
(1.1 Systematic Analysis and Problem Formulation) Tj
0 -20 Td
(University curriculum requirements emphasize analytical rigor and practical application.) Tj
0 -30 Td
(1.2 Key Formulations and Theoretical Derivations) Tj
0 -20 Td
(Review all lecture notes and chapter exercises in preparation for continuous assessments.) Tj
ET
endstream
endobj
10 0 obj
<< /Length 380 >>
stream
BT
/F2 16 Tf
50 770 Td
(Chapter 2: Solved Exercises & Past Examination Questions) Tj
/F1 11 Tf
0 -30 Td
(Review of standardized semester exam questions and detailed step-by-step solutions.) Tj
0 -25 Td
(Section 2.1: Model Question 1 - Comprehensive Analysis) Tj
0 -20 Td
(Section 2.2: Marking Guide & Solution Scheme for Students) Tj
0 -30 Td
(End of Document - CampusRead Verified Academic Publication) Tj
ET
endstream
endobj
xref
0 11
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000135 00000 n 
0000000257 00000 n 
0000000379 00000 n 
0000000501 00000 n 
0000000973 00000 n 
0000001048 00000 n 
0000001128 00000 n 
0000001540 00000 n 
trailer
<< /Size 11 /Root 1 0 R >>
startxref
1972
%%EOF`;

  const encoder = new TextEncoder();
  return encoder.encode(pdfContent).buffer;
}

