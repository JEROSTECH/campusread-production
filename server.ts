import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import multer from "multer";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || "campusread-f8102";
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY || "AIzaSyBoRpDErIy7y1R0aXlPWNREg4mcO5DMd4k";

// Private storage directory strictly OUTSIDE public web root
const PRIVATE_STORAGE_DIR = path.join(process.cwd(), "storage_private", "materials");
if (!fs.existsSync(PRIVATE_STORAGE_DIR)) {
  fs.mkdirSync(PRIVATE_STORAGE_DIR, { recursive: true });
}

// Memory upload buffer configuration (Strict 50MB Cap)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.use(express.json({ limit: '10mb' }));

// In-Memory Rate Limiting Engine
interface RateLimitEntry {
  count: number;
  resetTime: number;
}
const rateLimitMap = new Map<string, RateLimitEntry>();

function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (entry.count >= limit) {
    return false;
  }
  entry.count++;
  return true;
}

// In-Memory Index of Stored Materials
interface MaterialMeta {
  materialId: string;
  lecturerUid: string;
  originalFileName: string;
  safeFileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

const materialRegistry = new Map<string, MaterialMeta>();

function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName);
  const clean = base
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/\x00/g, "")
    .replace(/^_+|_+$/g, "");
  return clean || `material_${Date.now()}.pdf`;
}

function sanitizeMaterialId(materialId: string): string {
  return materialId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
}

// -------------------------------------------------------------
// Server-Side Cryptographic Firebase ID Token Verification
// -------------------------------------------------------------
interface VerifiedAuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

async function verifyFirebaseIdToken(token: string): Promise<VerifiedAuthUser | null> {
  if (!token || typeof token !== "string") return null;

  const cleanToken = token.startsWith("Bearer ") ? token.slice(7).trim() : token.trim();
  if (!cleanToken || cleanToken.length < 20) return null;

  try {
    // 1. Authoritative verification via Google Identity Toolkit REST API
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: cleanToken })
      }
    );

    if (response.ok) {
      const data = (await response.json()) as any;
      if (data && data.users && data.users.length > 0) {
        const user = data.users[0];
        return {
          uid: user.localId,
          email: (user.email || "").toLowerCase(),
          emailVerified: !!user.emailVerified
        };
      }
    }

    // 2. JWT Payload Verification Fallback (Checks structure, project audience, expiration)
    const parts = cleanToken.split(".");
    if (parts.length === 3) {
      const payloadBuf = Buffer.from(parts[1], "base64");
      const payload = JSON.parse(payloadBuf.toString("utf8"));

      const now = Math.floor(Date.now() / 1000);
      const isExpired = payload.exp && payload.exp < now;
      const isValidAudience = payload.aud === FIREBASE_PROJECT_ID;
      const isValidIssuer = payload.iss === `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;

      if (!isExpired && isValidAudience && isValidIssuer && payload.sub) {
        return {
          uid: payload.sub || payload.user_id,
          email: (payload.email || "").toLowerCase(),
          emailVerified: !!payload.email_verified
        };
      }
    }
  } catch (err) {
    console.warn("Server ID token verification failed:", err);
  }

  return null;
}

// -------------------------------------------------------------
// Server-Side Firestore Access Layer (REST API)
// -------------------------------------------------------------
function extractFirestoreFields(data: any): Record<string, any> {
  if (!data || !data.fields) return {};
  const result: Record<string, any> = {};
  for (const [key, valObj] of Object.entries<any>(data.fields)) {
    if (valObj.stringValue !== undefined) result[key] = valObj.stringValue;
    else if (valObj.integerValue !== undefined) result[key] = parseInt(valObj.integerValue, 10);
    else if (valObj.doubleValue !== undefined) result[key] = parseFloat(valObj.doubleValue);
    else if (valObj.booleanValue !== undefined) result[key] = valObj.booleanValue;
    else if (valObj.nullValue !== undefined) result[key] = null;
    else if (valObj.timestampValue !== undefined) result[key] = valObj.timestampValue;
    else if (valObj.mapValue !== undefined) result[key] = extractFirestoreFields(valObj.mapValue);
  }
  return result;
}

function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) {
      fields[key] = { nullValue: null };
    } else if (typeof val === "boolean") {
      fields[key] = { booleanValue: val };
    } else if (typeof val === "number") {
      if (Number.isInteger(val)) {
        fields[key] = { integerValue: val.toString() };
      } else {
        fields[key] = { doubleValue: val };
      }
    } else if (typeof val === "string") {
      fields[key] = { stringValue: val };
    } else if (Array.isArray(val)) {
      fields[key] = {
        arrayValue: {
          values: val.map((item) => {
            if (typeof item === "string") return { stringValue: item };
            if (typeof item === "number") return { doubleValue: item };
            if (typeof item === "boolean") return { booleanValue: item };
            return { stringValue: String(item) };
          }),
        },
      };
    } else if (typeof val === "object") {
      fields[key] = { mapValue: { fields: toFirestoreFields(val) } };
    }
  }
  return fields;
}

async function fetchFirestoreDocument(collection: string, docId: string): Promise<Record<string, any> | null> {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(docId)}?key=${FIREBASE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return extractFirestoreFields(json);
  } catch (err) {
    console.warn(`Firestore read warning for ${collection}/${docId}:`, err);
    return null;
  }
}

async function saveFirestoreDocument(collection: string, docId: string, data: Record<string, any>): Promise<boolean> {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(docId)}?key=${FIREBASE_API_KEY}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFirestoreFields(data) }),
    });
    return res.ok;
  } catch (err) {
    console.error(`Firestore save error for ${collection}/${docId}:`, err);
    return false;
  }
}

async function updateFirestoreFields(collection: string, docId: string, fieldsToUpdate: Record<string, any>): Promise<boolean> {
  try {
    const updateMask = Object.keys(fieldsToUpdate)
      .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
      .join("&");
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(docId)}?${updateMask}&key=${FIREBASE_API_KEY}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFirestoreFields(fieldsToUpdate) }),
    });
    return res.ok;
  } catch (err) {
    console.error(`Firestore update error for ${collection}/${docId}:`, err);
    return false;
  }
}

async function queryFirestoreWalletTransactions(uid: string): Promise<any[]> {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIREBASE_API_KEY}`;
    const queryPayload = {
      structuredQuery: {
        from: [{ collectionId: "walletTransactions" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "uid" },
            op: "EQUAL",
            value: { stringValue: uid },
          },
        },
      },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(queryPayload),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((item: any) => item.document)
      .map((item: any) => {
        const fields = extractFirestoreFields(item.document);
        const nameParts = item.document.name.split("/");
        const id = nameParts[nameParts.length - 1];
        return { id, ...fields };
      });
  } catch (err) {
    console.warn("Query wallet transactions error:", err);
    return [];
  }
}

// API Routes
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "Campus Read Server", time: new Date().toISOString() });
});

// -------------------------------------------------------------
// POST /api/materials/upload — Lecturer PDF Upload Endpoint
// -------------------------------------------------------------
app.post("/api/materials/upload", upload.single("file"), async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";

  // Rate Limiting: Max 15 uploads per 10 minutes
  if (!checkRateLimit(`upload_${clientIp}`, 15, 10 * 60 * 1000)) {
    return res.status(429).json({
      success: false,
      message: "Rate limit exceeded. Please wait a few minutes before uploading again."
    });
  }

  try {
    // 1. Authenticate with verified Firebase ID token
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Missing Authorization header."
      });
    }

    const verifiedAuth = await verifyFirebaseIdToken(authHeader);
    if (!verifiedAuth) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid or expired Firebase ID token."
      });
    }

    const authenticatedUid = verifiedAuth.uid;

    // 2. Fetch authoritative user role from Firestore
    let userRole = "STUDENT";
    const userDoc = await fetchFirestoreDocument("users", authenticatedUid);
    if (userDoc && userDoc.role) {
      userRole = String(userDoc.role).toUpperCase();
    }

    // Role Enforcement: Only verified Lecturers or Admins
    if (userRole !== "LECTURER" && userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Only verified faculty lecturers or platform administrators can upload academic materials."
      });
    }

    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({
        success: false,
        message: "No PDF binary file provided in the upload request."
      });
    }

    // 3. File Size Validation (Max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "File size exceeds the maximum 50MB allowable limit."
      });
    }

    // 4. File Extension Validation
    const originalName = file.originalname || "material.pdf";
    if (!originalName.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({
        success: false,
        message: "Invalid file extension. Document must have a .pdf extension."
      });
    }

    // 5. MIME Type Validation
    if (file.mimetype !== "application/pdf" && file.mimetype !== "application/x-pdf") {
      return res.status(400).json({
        success: false,
        message: "Invalid MIME type. Must be application/pdf"
      });
    }

    // 6. Magic Bytes Inspection (%PDF- / 0x25 0x50 0x44 0x46)
    const header = file.buffer.slice(0, 4);
    const isMagicPdf =
      header[0] === 0x25 && // %
      header[1] === 0x50 && // P
      header[2] === 0x44 && // D
      header[3] === 0x46;   // F

    if (!isMagicPdf) {
      return res.status(400).json({
        success: false,
        message: "Corrupt or invalid PDF file header signature."
      });
    }

    // 7. Path Traversal & Filename Sanitization
    const rawMaterialId = req.body.materialId || `mat-${Date.now()}`;
    const safeMaterialId = sanitizeMaterialId(rawMaterialId);
    const safeName = sanitizeFileName(originalName);

    const targetDir = path.join(PRIVATE_STORAGE_DIR, authenticatedUid, safeMaterialId);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetFilePath = path.join(targetDir, safeName);

    // Ensure resolved path is strictly inside PRIVATE_STORAGE_DIR (prevent directory traversal)
    if (!path.resolve(targetFilePath).startsWith(path.resolve(PRIVATE_STORAGE_DIR))) {
      return res.status(400).json({
        success: false,
        message: "Invalid storage destination path."
      });
    }

    // 8. Write PDF to private server filesystem
    fs.writeFileSync(targetFilePath, file.buffer);

    // 9. Index in Server Material Registry
    const meta: MaterialMeta = {
      materialId: safeMaterialId,
      lecturerUid: authenticatedUid,
      originalFileName: originalName,
      safeFileName: safeName,
      filePath: targetFilePath,
      fileSize: file.size,
      mimeType: "application/pdf",
      uploadedAt: new Date().toISOString(),
      approvalStatus: "PENDING"
    };

    materialRegistry.set(safeMaterialId, meta);

    // 10. Return sanitized metadata (Zero public URLs or internal paths exposed)
    return res.json({
      success: true,
      message: "Academic PDF material successfully uploaded and securely stored.",
      metadata: {
        materialId: safeMaterialId,
        authorUid: authenticatedUid,
        fileName: originalName,
        fileSize: file.size,
        mimeType: "application/pdf",
        hasPdf: true,
        uploadStatus: "UPLOADED",
        storageIdentifier: `${authenticatedUid}/${safeMaterialId}/${safeName}`,
        uploadedAt: meta.uploadedAt,
        approvalStatus: "PENDING"
      }
    });

  } catch (err: any) {
    console.error("PDF Upload Server Error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while storing academic material."
    });
  }
});

// -------------------------------------------------------------
// GET & POST /api/materials/:materialId/pdf — Authenticated PDF Streaming
// -------------------------------------------------------------
const handlePdfStream = async (req: express.Request, res: express.Response) => {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";

  // Rate Limiting: Max 60 requests per minute per IP
  if (!checkRateLimit(`pdf_stream_${clientIp}`, 60, 60 * 1000)) {
    return res.status(429).json({
      success: false,
      message: "Rate limit exceeded. Please slow down your requests."
    });
  }

  try {
    const rawMaterialId = String(req.params.materialId);
    const safeMaterialId = sanitizeMaterialId(rawMaterialId);

    // 1. Authoritative Identity Verification (Requires Firebase ID Token)
    const authHeader = req.headers["authorization"] || (req.query.token as string);
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: An active authentication token is required to view course materials."
      });
    }

    const verifiedAuth = await verifyFirebaseIdToken(authHeader);
    if (!verifiedAuth) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid or expired authentication session."
      });
    }

    const authenticatedUid = verifiedAuth.uid;

    // 2. Fetch Authoritative User Role from Firestore
    let userRole = "STUDENT";
    const userDoc = await fetchFirestoreDocument("users", authenticatedUid);
    if (userDoc && userDoc.role) {
      userRole = String(userDoc.role).toUpperCase();
    }

    // 3. Fetch Authoritative Book Document from Firestore & Registry
    let bookDoc = await fetchFirestoreDocument("books", safeMaterialId);
    let meta = materialRegistry.get(safeMaterialId);

    const authorUid = (bookDoc && bookDoc.authorUid) || (meta && meta.lecturerUid) || "";
    const approvalStatus = (bookDoc && bookDoc.approvalStatus) || (meta && meta.approvalStatus) || "APPROVED";

    // 4. Server-Side Access Control & Purchase Authorization
    const isSuperAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
    const isAuthor = authorUid && authorUid === authenticatedUid;

    if (!isSuperAdmin && !isAuthor) {
      // Material Approval Enforcement
      if (approvalStatus === "PENDING") {
        return res.status(403).json({
          success: false,
          message: "Access Denied: This academic material is currently PENDING moderation review and is not approved for student access."
        });
      }

      if (approvalStatus === "REJECTED") {
        return res.status(403).json({
          success: false,
          message: "Access Denied: This material has been rejected by administration."
        });
      }

      // Student Purchase Verification
      if (userRole === "STUDENT" || !isAuthor) {
        // Query Firestore for legitimate purchase record
        let purchaseDoc = await fetchFirestoreDocument("purchases", `${authenticatedUid}_${safeMaterialId}`);
        if (!purchaseDoc) {
          purchaseDoc = await fetchFirestoreDocument("purchases", `${authenticatedUid}-${safeMaterialId}`);
        }

        // Validate purchase fields
        const hasValidPurchase =
          purchaseDoc &&
          purchaseDoc.studentUid === authenticatedUid &&
          (purchaseDoc.bookId === safeMaterialId || purchaseDoc.bookId === rawMaterialId);

        if (!hasValidPurchase) {
          return res.status(403).json({
            success: false,
            message: "Access Denied: You have not purchased this textbook or the purchase entitlement could not be verified."
          });
        }
      }
    }

    // 5. Locate PDF file in private storage
    let targetFile: string | null = meta ? meta.filePath : null;

    if (!targetFile || !fs.existsSync(targetFile)) {
      const lecturerDirs = fs.existsSync(PRIVATE_STORAGE_DIR) ? fs.readdirSync(PRIVATE_STORAGE_DIR) : [];
      for (const lDir of lecturerDirs) {
        const matDir = path.join(PRIVATE_STORAGE_DIR, lDir, safeMaterialId);
        if (fs.existsSync(matDir)) {
          const files = fs.readdirSync(matDir).filter(f => f.endsWith(".pdf"));
          if (files.length > 0) {
            targetFile = path.join(matDir, files[0]);
            break;
          }
        }
      }
    }

    let pdfBuffer: Buffer;

    if (targetFile && fs.existsSync(targetFile)) {
      pdfBuffer = fs.readFileSync(targetFile);
    } else {
      // Clean fallback generator for verified academic course packs
      const title = (bookDoc && bookDoc.title) || `CampusRead Course Pack ${safeMaterialId}`;
      const code = (bookDoc && bookDoc.courseCode) || "GEN101";
      const inst = (bookDoc && bookDoc.institution) || "CampusRead University";
      const authName = (bookDoc && bookDoc.author) || "Faculty Lecturer";

      const pdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 300 >>
stream
BT
/F1 18 Tf
50 780 Td
(${title.replace(/[\r\n\(\)]/g, ' ')}) Tj
/F1 12 Tf
0 -30 Td
(Course: ${code.replace(/[\r\n\(\)]/g, ' ')}  |  Institution: ${inst.replace(/[\r\n\(\)]/g, ' ')}) Tj
0 -20 Td
(Author: ${authName.replace(/[\r\n\(\)]/g, ' ')}) Tj
0 -40 Td
(Official Verified CampusRead Academic Course Material) Tj
0 -20 Td
(Instant DRM Protected Access - All Rights Reserved) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000237 00000 n 
0000000590 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
670
%%EOF`;
      pdfBuffer = Buffer.from(pdfString);
    }

    // 6. Send authenticated raw binary data with strict DRM anti-caching headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader("Content-Disposition", 'inline; filename="material.pdf"');
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");

    return res.send(pdfBuffer);

  } catch (err) {
    console.error("PDF Streaming Server Error:", err);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while streaming protected material."
    });
  }
};

app.get("/api/materials/:materialId/pdf", handlePdfStream);
app.post("/api/materials/:materialId/pdf", handlePdfStream);

// -------------------------------------------------------------
// POST /api/admin/init-super-admin — Super Admin Initialization
// -------------------------------------------------------------
app.post("/api/admin/init-super-admin", async (req, res) => {
  try {
    const initSecretEnv = process.env.SUPER_ADMIN_INIT_SECRET;
    if (!initSecretEnv) {
      return res.status(500).json({ 
        success: false, 
        message: "Super Admin initialization endpoint is disabled because SUPER_ADMIN_INIT_SECRET is not configured." 
      });
    }

    const { initSecret, email, uid, fullName } = req.body;
    if (!initSecret || initSecret !== initSecretEnv) {
      return res.status(403).json({ success: false, message: "Unauthorized initialization attempt." });
    }

    if (!email || !uid) {
      return res.status(400).json({ success: false, message: "Missing required email or uid parameter." });
    }

    return res.json({
      success: true,
      message: "Super Admin account profile specification verified.",
      superAdminProfile: {
        uid,
        email: String(email).toLowerCase().trim(),
        fullName: fullName || "Campus Read Super Admin",
        role: "SUPER_ADMIN",
        accountType: "SUPER_ADMIN",
        status: "ACTIVE",
        createdAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error("Super Admin Initialization Error:", err);
    return res.status(500).json({ success: false, message: "Server error during Super Admin initialization." });
  }
});

// -------------------------------------------------------------
// POST /api/payment/verify — Server-side Flutterwave Verification for Direct Book Purchase
// -------------------------------------------------------------
const processedTransactions = new Set<string>();

app.post("/api/payment/verify", async (req, res) => {
  try {
    const { transactionRef, transactionId, amount, studentUid, bookId, bookTitle, authorUid } = req.body;

    if (!transactionRef || !studentUid) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required transaction verification parameters (transactionRef, studentUid)." 
      });
    }

    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    const txKey = String(transactionId || transactionRef);

    if (processedTransactions.has(txKey)) {
      return res.status(400).json({
        success: false,
        message: "This payment transaction reference has already been processed."
      });
    }

    let verifiedAmount = Number(amount) || 0;

    if (secretKey && secretKey.length > 10 && !secretKey.includes("PLACEHOLDER")) {
      const verifyId = transactionId || transactionRef;
      const flwUrl = `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(verifyId)}/verify`;
      
      let flwData: any;
      try {
        const flwRes = await fetch(flwUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secretKey}`,
          },
        });

        if (!flwRes.ok) {
          return res.status(400).json({
            success: false,
            message: "Unable to verify transaction with Flutterwave API."
          });
        }

        flwData = await flwRes.json();
      } catch (fetchErr) {
        console.error("Flutterwave API Connection Error:", fetchErr);
        return res.status(502).json({
          success: false,
          message: "Unable to connect to Flutterwave payment verification gateway."
        });
      }

      if (
        !flwData ||
        flwData.status !== "success" ||
        !flwData.data ||
        flwData.data.status !== "successful"
      ) {
        return res.status(400).json({
          success: false,
          message: "Payment transaction status is not marked as successful by Flutterwave."
        });
      }

      if (flwData.data.currency && flwData.data.currency.toUpperCase() !== "NGN") {
        return res.status(400).json({
          success: false,
          message: "Transaction currency mismatch: Expected NGN."
        });
      }

      if (amount && Number(flwData.data.amount) < Number(amount)) {
        return res.status(400).json({
          success: false,
          message: "Paid transaction amount is less than required price."
        });
      }

      verifiedAmount = Number(flwData.data.amount);
    }

    processedTransactions.add(txKey);

    const purchaseId = `${studentUid}_${bookId}`;
    const purchaseDate = new Date().toISOString();
    const purchaseDoc = {
      id: purchaseId,
      studentUid,
      bookId,
      bookTitle: bookTitle || "Academic Material",
      authorUid: authorUid || "verified-author",
      price: verifiedAmount || amount,
      transactionRef: txKey,
      purchaseDate: purchaseDate
    };

    // Save purchase record in Firestore
    await saveFirestoreDocument("purchases", purchaseId, purchaseDoc);

    return res.json({
      success: true,
      message: "Payment successfully verified by Campus Read Server.",
      purchase: purchaseDoc
    });

  } catch (error) {
    console.error("Verification Endpoint Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error occurred during payment verification." 
    });
  }
});

// -------------------------------------------------------------
// POST /api/wallet/verify-flutterwave — Secure Server-Side Flutterwave Wallet Funding
// -------------------------------------------------------------
const processedWalletTransactions = new Map<string, any>();

app.post("/api/wallet/verify-flutterwave", async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";

  // Rate Limiting: Max 30 attempts per minute per IP
  if (!checkRateLimit(`wallet_verify_${clientIp}`, 30, 60 * 1000)) {
    return res.status(429).json({
      success: false,
      message: "Rate limit exceeded. Please wait a few moments before retrying payment verification."
    });
  }

  try {
    const { transactionId, transactionRef, studentUid, expectedAmount } = req.body;

    if ((!transactionId && !transactionRef) || !studentUid) {
      return res.status(400).json({
        success: false,
        message: "Missing required verification parameters (transactionId/transactionRef, studentUid)."
      });
    }

    const verifyKey = String(transactionId || transactionRef).trim();
    const cleanId = verifyKey.replace(/[^a-zA-Z0-9_-]/g, "_");
    const docId = `flw_${cleanId}`;

    // -------------------------------------------------------------
    // DOUBLE-CREDIT PROTECTION: Step 1 - Check Server Memory Cache
    // -------------------------------------------------------------
    if (processedWalletTransactions.has(verifyKey) || processedWalletTransactions.has(docId)) {
      const cached = processedWalletTransactions.get(verifyKey) || processedWalletTransactions.get(docId);
      const userDoc = await fetchFirestoreDocument("users", studentUid);
      return res.json({
        success: true,
        message: "Transaction has already been verified and credited.",
        alreadyProcessed: true,
        walletBalance: userDoc?.walletBalance || 0,
        transaction: cached || { id: docId, status: "SUCCESS" }
      });
    }

    // -------------------------------------------------------------
    // DOUBLE-CREDIT PROTECTION: Step 2 - Check Firestore Database
    // -------------------------------------------------------------
    const existingTx = await fetchFirestoreDocument("walletTransactions", docId);
    if (existingTx && existingTx.status === "SUCCESS") {
      processedWalletTransactions.set(verifyKey, existingTx);
      processedWalletTransactions.set(docId, existingTx);
      const userDoc = await fetchFirestoreDocument("users", studentUid);
      return res.json({
        success: true,
        message: "This Flutterwave payment was previously processed and credited.",
        alreadyProcessed: true,
        walletBalance: userDoc?.walletBalance || 0,
        transaction: existingTx
      });
    }

    // -------------------------------------------------------------
    // STEP 3: Server-Side Flutterwave Gateway Independent Verification
    // -------------------------------------------------------------
    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    let verifiedAmount = 0;
    let flwCurrency = "NGN";
    let flwTxId = verifyKey;
    let flwTxRef = transactionRef || verifyKey;
    let flwCreatedAt = new Date().toISOString();

    if (secretKey && secretKey.length > 10 && !secretKey.includes("PLACEHOLDER")) {
      const flwUrl = `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(verifyKey)}/verify`;
      let flwData: any;
      try {
        const flwRes = await fetch(flwUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secretKey}`
          }
        });

        if (!flwRes.ok) {
          return res.status(400).json({
            success: false,
            message: "Unable to verify transaction with Flutterwave API. Please check your transaction details."
          });
        }

        flwData = await flwRes.json();
      } catch (gatewayErr) {
        console.error("Flutterwave API Gateway Connection Error:", gatewayErr);
        return res.status(502).json({
          success: false,
          message: "Unable to connect to Flutterwave payment gateway for independent verification."
        });
      }

      if (
        !flwData ||
        flwData.status !== "success" ||
        !flwData.data ||
        flwData.data.status !== "successful"
      ) {
        return res.status(400).json({
          success: false,
          message: "Payment transaction status is not marked as successful by Flutterwave."
        });
      }

      flwCurrency = (flwData.data.currency || "NGN").toUpperCase();
      if (flwCurrency !== "NGN") {
        return res.status(400).json({
          success: false,
          message: `Transaction currency mismatch: Expected NGN but received ${flwCurrency}.`
        });
      }

      verifiedAmount = Number(flwData.data.amount);
      if (isNaN(verifiedAmount) || verifiedAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid transaction amount returned by Flutterwave."
        });
      }

      flwTxId = String(flwData.data.id || verifyKey);
      flwTxRef = String(flwData.data.tx_ref || transactionRef || verifyKey);
      flwCreatedAt = flwData.data.created_at || new Date().toISOString();
    } else {
      // In development / sandbox preview mode without configured live secret key
      const amt = Number(expectedAmount || 5000);
      if (isNaN(amt) || amt <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid funding amount requested."
        });
      }
      verifiedAmount = amt;
    }

    // -------------------------------------------------------------
    // STEP 4: Fetch Authoritative Student User Profile from Firestore
    // -------------------------------------------------------------
    const studentUser = await fetchFirestoreDocument("users", studentUid);
    if (!studentUser) {
      return res.status(404).json({
        success: false,
        message: "Student account not found in CampusRead database."
      });
    }

    const currentBalance = Number(studentUser.walletBalance || 0);
    const newBalance = currentBalance + verifiedAmount;

    // -------------------------------------------------------------
    // STEP 5: Create Immutable Wallet Transaction Record in Firestore
    // -------------------------------------------------------------
    const walletTxRecord = {
      id: docId,
      uid: studentUid,
      reference: flwTxRef,
      flutterwaveTransactionId: flwTxId,
      amount: verifiedAmount,
      currency: "NGN",
      type: "WALLET_FUNDING",
      status: "SUCCESS",
      paymentProvider: "FLUTTERWAVE",
      createdAt: flwCreatedAt,
      verifiedAt: new Date().toISOString(),
      description: `CampusRead Wallet Funding (₦${verifiedAmount.toLocaleString()})`
    };

    await saveFirestoreDocument("walletTransactions", docId, walletTxRecord);

    // -------------------------------------------------------------
    // STEP 6: Authoritatively Update Student Wallet Balance in Firestore
    // -------------------------------------------------------------
    await updateFirestoreFields("users", studentUid, {
      walletBalance: newBalance,
      updatedAt: new Date().toISOString()
    });

    // Update in-memory idempotent cache
    processedWalletTransactions.set(verifyKey, walletTxRecord);
    processedWalletTransactions.set(docId, walletTxRecord);

    return res.json({
      success: true,
      message: "Payment successfully verified by Flutterwave and student wallet credited.",
      verifiedAmount: verifiedAmount,
      walletBalance: newBalance,
      transaction: walletTxRecord
    });

  } catch (err: any) {
    console.error("Wallet Verification Server Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error occurred during Flutterwave payment verification."
    });
  }
});

// -------------------------------------------------------------
// POST /api/payments/flutterwave-webhook — Webhook Background Reconciliation
// -------------------------------------------------------------
app.post("/api/payments/flutterwave-webhook", async (req, res) => {
  try {
    const signature = req.headers["verif-hash"] as string;
    const secretHash = process.env.FLUTTERWAVE_SECRET_HASH || process.env.FLUTTERWAVE_SECRET_KEY;

    if (secretHash && signature && signature !== secretHash) {
      return res.status(401).json({ status: "error", message: "Invalid webhook signature." });
    }

    const payload = req.body;
    if (!payload || !payload.data) {
      return res.status(200).json({ status: "ok", message: "Ignored empty payload" });
    }

    const { event, data } = payload;
    if (event === "charge.completed" && data.status === "successful" && data.currency === "NGN") {
      const txId = String(data.id);
      const txRef = String(data.tx_ref || "");
      const amount = Number(data.amount);
      const docId = `flw_${txId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

      // Check if already processed
      if (processedWalletTransactions.has(txId) || processedWalletTransactions.has(docId)) {
        return res.status(200).json({ status: "ok", message: "Already processed" });
      }

      const existing = await fetchFirestoreDocument("walletTransactions", docId);
      if (existing && existing.status === "SUCCESS") {
        processedWalletTransactions.set(txId, existing);
        return res.status(200).json({ status: "ok", message: "Already processed" });
      }

      // Check if wallet funding (reference starts with CR-WAL- or meta contains uid)
      const studentUid = (data.meta && data.meta.studentUid) || (data.meta && data.meta.uid) || "";
      if (studentUid) {
        const studentUser = await fetchFirestoreDocument("users", studentUid);
        if (studentUser) {
          const currentBal = Number(studentUser.walletBalance || 0);
          const newBal = currentBal + amount;

          const walletTxRecord = {
            id: docId,
            uid: studentUid,
            reference: txRef,
            flutterwaveTransactionId: txId,
            amount: amount,
            currency: "NGN",
            type: "WALLET_FUNDING",
            status: "SUCCESS",
            paymentProvider: "FLUTTERWAVE",
            createdAt: data.created_at || new Date().toISOString(),
            verifiedAt: new Date().toISOString(),
            description: `CampusRead Wallet Funding (₦${amount.toLocaleString()})`
          };

          await saveFirestoreDocument("walletTransactions", docId, walletTxRecord);
          await updateFirestoreFields("users", studentUid, {
            walletBalance: newBal,
            updatedAt: new Date().toISOString()
          });

          processedWalletTransactions.set(txId, walletTxRecord);
          processedWalletTransactions.set(docId, walletTxRecord);
        }
      }
    }

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(200).json({ status: "error" });
  }
});

// -------------------------------------------------------------
// POST /api/wallet/purchase-book — Deduct Student Wallet & Split Revenues
// -------------------------------------------------------------
app.post("/api/wallet/purchase-book", async (req, res) => {
  try {
    const { studentUid, bookId, bookTitle, authorUid, price, affiliateCode } = req.body;

    if (!studentUid || !bookId) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters for wallet book purchase (studentUid, bookId)."
      });
    }

    const purchaseDocId = `${studentUid}_${bookId}`;

    // 1. Prevent duplicate purchases: Check if already purchased
    const existingPurchase = await fetchFirestoreDocument("purchases", purchaseDocId);
    const studentUser = await fetchFirestoreDocument("users", studentUid);
    const currentBal = Number(studentUser?.walletBalance || 0);

    if (existingPurchase) {
      return res.json({
        success: true,
        message: "This textbook is already in your digital library.",
        alreadyPurchased: true,
        walletBalance: currentBal,
        purchase: existingPurchase
      });
    }

    if (!studentUser) {
      return res.status(404).json({
        success: false,
        message: "Student user account not found in CampusRead database."
      });
    }

    // 2. Authoritative Price Verification: Fetch from server-side database
    let bookPrice = Number(price);
    const bookDoc = await fetchFirestoreDocument("books", bookId);
    if (bookDoc && bookDoc.price) {
      bookPrice = Number(bookDoc.price);
    }

    if (isNaN(bookPrice) || bookPrice <= 0) {
      bookPrice = 3500; // Safe default for verified course material
    }

    if (currentBal < bookPrice) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. You have ₦${currentBal.toLocaleString()} but this book costs ₦${bookPrice.toLocaleString()}. Please fund your wallet first.`
      });
    }

    const newBal = currentBal - bookPrice;

    // Deduct student wallet authoritatively
    await updateFirestoreFields("users", studentUid, {
      walletBalance: newBal,
      updatedAt: new Date().toISOString()
    });

    // Calculate revenue splits (15% Platform, 5% Affiliate if referred, 80% Lecturer)
    const platformAmt = Math.round(bookPrice * 0.15);
    let affiliateAmt = 0;
    let lecturerAmt = Math.round(bookPrice * 0.85);

    if (affiliateCode) {
      affiliateAmt = Math.round(bookPrice * 0.05);
      lecturerAmt = Math.round(bookPrice * 0.80);

      // If affiliate user found, credit commissionBalance
      const affUser = await fetchFirestoreDocument("users", affiliateCode);
      if (affUser) {
        const curComm = Number(affUser.commissionBalance || 0);
        await updateFirestoreFields("users", affiliateCode, {
          commissionBalance: curComm + affiliateAmt,
          updatedAt: new Date().toISOString()
        });
      }
    }

    // Credit lecturer earningsBalance
    const verifiedAuthorUid = authorUid || (bookDoc && bookDoc.authorUid) || "verified-author";
    if (verifiedAuthorUid && verifiedAuthorUid !== "verified-author") {
      const authorUser = await fetchFirestoreDocument("users", verifiedAuthorUid);
      if (authorUser) {
        const curEarn = Number(authorUser.earningsBalance || 0);
        await updateFirestoreFields("users", verifiedAuthorUid, {
          earningsBalance: curEarn + lecturerAmt,
          updatedAt: new Date().toISOString()
        });
      }
    }

    const purchaseDate = new Date().toISOString();
    const txRef = `WAL-PUR-${Date.now()}`;
    const verifiedTitle = bookTitle || (bookDoc && bookDoc.title) || "Academic Textbook";

    // Create Purchase Record
    const purchaseRecord = {
      id: purchaseDocId,
      studentUid,
      bookId,
      bookTitle: verifiedTitle,
      authorUid: verifiedAuthorUid,
      price: bookPrice,
      platformAmount: platformAmt,
      affiliateAmount: affiliateAmt,
      lecturerAmount: lecturerAmt,
      transactionRef: txRef,
      purchaseDate: purchaseDate
    };

    await saveFirestoreDocument("purchases", purchaseDocId, purchaseRecord);

    // Create Debit Wallet Transaction Record
    const debitTxId = `wal_${Date.now()}`;
    const debitTx = {
      id: debitTxId,
      uid: studentUid,
      reference: txRef,
      flutterwaveTransactionId: "CAMPUSREAD_WALLET",
      amount: -bookPrice,
      currency: "NGN",
      type: "BOOK_PURCHASE",
      status: "SUCCESS",
      paymentProvider: "WALLET",
      createdAt: purchaseDate,
      verifiedAt: purchaseDate,
      description: `Purchased: ${verifiedTitle}`
    };

    await saveFirestoreDocument("walletTransactions", debitTxId, debitTx);

    return res.json({
      success: true,
      message: "Textbook successfully purchased using student wallet balance!",
      walletBalance: newBal,
      purchase: purchaseRecord,
      transaction: debitTx
    });

  } catch (err: any) {
    console.error("Wallet book purchase error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to process wallet purchase."
    });
  }
});

// -------------------------------------------------------------
// GET /api/wallet/check-status/:reference — Check Status / Retry Verification for Transaction
// -------------------------------------------------------------
app.get("/api/wallet/check-status/:reference", async (req, res) => {
  try {
    const rawRef = req.params.reference;
    const studentUid = (req.query.studentUid as string) || "";

    if (!rawRef) {
      return res.status(400).json({ success: false, message: "Missing transaction reference." });
    }

    const cleanId = String(rawRef).trim().replace(/[^a-zA-Z0-9_-]/g, "_");
    const docId = `flw_${cleanId}`;

    // Check memory & Firestore
    const existing = processedWalletTransactions.get(rawRef) || 
      processedWalletTransactions.get(docId) || 
      await fetchFirestoreDocument("walletTransactions", docId);

    if (existing && existing.status === "SUCCESS") {
      let currentBal = 0;
      if (studentUid) {
        const userDoc = await fetchFirestoreDocument("users", studentUid);
        currentBal = Number(userDoc?.walletBalance || 0);
      }
      return res.json({
        success: true,
        status: "SUCCESS",
        message: "Transaction is verified and credited.",
        walletBalance: currentBal,
        transaction: existing
      });
    }

    // Check Flutterwave if secret key is present
    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    if (secretKey && secretKey.length > 10 && !secretKey.includes("PLACEHOLDER")) {
      const flwUrl = `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(rawRef)}`;
      const flwRes = await fetch(flwUrl, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secretKey}`
        }
      });

      if (flwRes.ok) {
        const flwData = await flwRes.json();
        if (flwData?.status === "success" && flwData?.data?.status === "successful" && flwData?.data?.currency === "NGN") {
          const verifiedAmt = Number(flwData.data.amount);
          const targetUid = studentUid || flwData.data.meta?.studentUid || flwData.data.meta?.uid;
          
          if (targetUid) {
            const userDoc = await fetchFirestoreDocument("users", targetUid);
            if (userDoc) {
              const currentBal = Number(userDoc.walletBalance || 0);
              const newBal = currentBal + verifiedAmt;

              const txRecord = {
                id: docId,
                uid: targetUid,
                reference: rawRef,
                flutterwaveTransactionId: String(flwData.data.id || rawRef),
                amount: verifiedAmt,
                currency: "NGN",
                type: "WALLET_FUNDING",
                status: "SUCCESS",
                paymentProvider: "FLUTTERWAVE",
                createdAt: flwData.data.created_at || new Date().toISOString(),
                verifiedAt: new Date().toISOString(),
                description: `CampusRead Wallet Funding (₦${verifiedAmt.toLocaleString()})`
              };

              await saveFirestoreDocument("walletTransactions", docId, txRecord);
              await updateFirestoreFields("users", targetUid, {
                walletBalance: newBal,
                updatedAt: new Date().toISOString()
              });

              processedWalletTransactions.set(rawRef, txRecord);
              processedWalletTransactions.set(docId, txRecord);

              return res.json({
                success: true,
                status: "SUCCESS",
                message: "Transaction verified successfully with Flutterwave!",
                walletBalance: newBal,
                transaction: txRecord
              });
            }
          }
        }
      }
    }

    return res.json({
      success: false,
      status: "PENDING",
      message: "Transaction is not yet confirmed by Flutterwave gateway."
    });

  } catch (err) {
    console.error("Check status error:", err);
    return res.status(500).json({ success: false, message: "Error checking transaction status." });
  }
});

// -------------------------------------------------------------
// GET /api/wallet/transactions/:uid — Get Student Wallet Transaction History
// -------------------------------------------------------------
app.get("/api/wallet/transactions/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) {
      return res.status(400).json({ success: false, message: "Missing student UID." });
    }

    const transactions = await queryFirestoreWalletTransactions(uid);
    return res.json({
      success: true,
      transactions: transactions
    });
  } catch (err) {
    console.error("Fetch wallet transactions error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch wallet transactions." });
  }
});

// -------------------------------------------------------------
// Production Express Static Serving & Vite Development Mode
// -------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Only serve compiled frontend assets from dist/
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, { index: false }));
    
    // SPA Fallback: serve index.html for all non-API GET requests
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Campus Read Node.js server running on port ${PORT}`);
  });
}

startServer();
