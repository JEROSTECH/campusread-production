import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import multer from "multer";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();

const PORT = process.env.PORT
  ? parseInt(process.env.PORT, 10)
  : 3000;

const FIREBASE_PROJECT_ID =
  process.env.VITE_FIREBASE_PROJECT_ID || "campusread-f8102";

const FIREBASE_API_KEY =
  process.env.VITE_FIREBASE_API_KEY ||
  "AIzaSyBoRpDErIy7y1R0aXlPWNREg4mcO5DMd4k";

/**
 * IMPORTANT:
 * CampusRead minimum wallet funding is ₦1,000.
 * This is enforced on the SERVER, not only in the frontend.
 */
const MIN_WALLET_FUNDING = 1000;

const MAX_PDF_SIZE = 50 * 1024 * 1024;

// -------------------------------------------------------------
// PRIVATE STORAGE
// -------------------------------------------------------------

const PRIVATE_STORAGE_DIR = path.join(
  process.cwd(),
  "storage_private",
  "materials"
);

if (!fs.existsSync(PRIVATE_STORAGE_DIR)) {
  fs.mkdirSync(PRIVATE_STORAGE_DIR, { recursive: true });
}

// -------------------------------------------------------------
// MULTER
// -------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PDF_SIZE,
  },
});

app.use(express.json({ limit: "10mb" }));

// -------------------------------------------------------------
// RATE LIMITING
// -------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });

    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;

  return true;
}

// -------------------------------------------------------------
// MATERIAL REGISTRY
// -------------------------------------------------------------

interface MaterialMeta {
  materialId: string;
  lecturerUid: string;
  originalFileName: string;
  safeFileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
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
  return String(materialId)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 100);
}

// -------------------------------------------------------------
// FIREBASE AUTHENTICATION
// -------------------------------------------------------------

interface VerifiedAuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

async function verifyFirebaseIdToken(
  token: string
): Promise<VerifiedAuthUser | null> {
  if (!token || typeof token !== "string") {
    return null;
  }

  const cleanToken = token
    .startsWith("Bearer ")
    ? token.slice(7).trim()
    : token.trim();

  if (!cleanToken || cleanToken.length < 20) {
    return null;
  }

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idToken: cleanToken,
        }),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as any;

    if (!data?.users?.length) {
      return null;
    }

    const user = data.users[0];

    return {
      uid: String(user.localId),
      email: String(user.email || "").toLowerCase(),
      emailVerified: Boolean(user.emailVerified),
    };
  } catch (error) {
    console.warn(
      "Server Firebase ID token verification failed:",
      error
    );

    return null;
  }
}

async function requireAuthenticatedUid(
  req: express.Request
): Promise<string | null> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  const verified = await verifyFirebaseIdToken(authHeader);

  return verified?.uid || null;
}

// -------------------------------------------------------------
// FIRESTORE REST HELPERS
// -------------------------------------------------------------

function extractFirestoreFields(
  data: any
): Record<string, any> {
  if (!data?.fields) {
    return {};
  }

  const result: Record<string, any> = {};

  for (const [key, valObj] of Object.entries<any>(
    data.fields
  )) {
    if (valObj.stringValue !== undefined) {
      result[key] = valObj.stringValue;
    } else if (valObj.integerValue !== undefined) {
      result[key] = parseInt(valObj.integerValue, 10);
    } else if (valObj.doubleValue !== undefined) {
      result[key] = parseFloat(valObj.doubleValue);
    } else if (valObj.booleanValue !== undefined) {
      result[key] = valObj.booleanValue;
    } else if (valObj.nullValue !== undefined) {
      result[key] = null;
    } else if (valObj.timestampValue !== undefined) {
      result[key] = valObj.timestampValue;
    } else if (valObj.mapValue !== undefined) {
      result[key] = extractFirestoreFields(valObj.mapValue);
    } else if (valObj.arrayValue !== undefined) {
      result[key] = (valObj.arrayValue.values || []).map(
        (item: any) => {
          if (item.stringValue !== undefined) {
            return item.stringValue;
          }

          if (item.integerValue !== undefined) {
            return parseInt(item.integerValue, 10);
          }

          if (item.doubleValue !== undefined) {
            return parseFloat(item.doubleValue);
          }

          if (item.booleanValue !== undefined) {
            return item.booleanValue;
          }

          if (item.mapValue !== undefined) {
            return extractFirestoreFields(item.mapValue);
          }

          return null;
        }
      );
    }
  }

  return result;
}

function toFirestoreFields(
  obj: Record<string, any>
): Record<string, any> {
  const fields: Record<string, any> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) {
      fields[key] = {
        nullValue: null,
      };
    } else if (typeof val === "boolean") {
      fields[key] = {
        booleanValue: val,
      };
    } else if (typeof val === "number") {
      if (Number.isInteger(val)) {
        fields[key] = {
          integerValue: val.toString(),
        };
      } else {
        fields[key] = {
          doubleValue: val,
        };
      }
    } else if (typeof val === "string") {
      fields[key] = {
        stringValue: val,
      };
    } else if (Array.isArray(val)) {
      fields[key] = {
        arrayValue: {
          values: val.map((item) => {
            if (typeof item === "string") {
              return { stringValue: item };
            }

            if (typeof item === "number") {
              return Number.isInteger(item)
                ? { integerValue: item.toString() }
                : { doubleValue: item };
            }

            if (typeof item === "boolean") {
              return { booleanValue: item };
            }

            if (item === null) {
              return { nullValue: null };
            }

            if (typeof item === "object") {
              return {
                mapValue: {
                  fields: toFirestoreFields(item),
                },
              };
            }

            return {
              stringValue: String(item),
            };
          }),
        },
      };
    } else if (typeof val === "object") {
      fields[key] = {
        mapValue: {
          fields: toFirestoreFields(val),
        },
      };
    }
  }

  return fields;
}

async function fetchFirestoreDocument(
  collection: string,
  docId: string,
  authToken?: string
): Promise<Record<string, any> | null> {
  try {
    const url =
      `https://firestore.googleapis.com/v1/projects/` +
      `${FIREBASE_PROJECT_ID}/databases/(default)/documents/` +
      `${collection}/${encodeURIComponent(docId)}` +
      `?key=${FIREBASE_API_KEY}`;

   const response = await fetch(url, {
  headers: authToken
    ? {
        Authorization: authToken.startsWith("Bearer ")
          ? authToken
          : `Bearer ${authToken}`,
      }
    : undefined,
});

    if (!response.ok) {
      return null;
    }

    const json = await response.json();

    return extractFirestoreFields(json);
  } catch (error) {
    console.warn(
      `Firestore read warning for ${collection}/${docId}:`,
      error
    );

    return null;
  }
}

async function saveFirestoreDocument(
  collection: string,
  docId: string,
  data: Record<string, any>
): Promise<boolean> {
  try {
    const url =
      `https://firestore.googleapis.com/v1/projects/` +
      `${FIREBASE_PROJECT_ID}/databases/(default)/documents/` +
      `${collection}/${encodeURIComponent(docId)}` +
      `?key=${FIREBASE_API_KEY}`;

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: toFirestoreFields(data),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        `Firestore save failed for ${collection}/${docId}:`,
        response.status,
        errorText
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      `Firestore save error for ${collection}/${docId}:`,
      error
    );

    return false;
  }
}

async function updateFirestoreFields(
  collection: string,
  docId: string,
  fieldsToUpdate: Record<string, any>
): Promise<boolean> {
  try {
    const updateMask = Object.keys(fieldsToUpdate)
      .map(
        (field) =>
          `updateMask.fieldPaths=${encodeURIComponent(field)}`
      )
      .join("&");

    const url =
      `https://firestore.googleapis.com/v1/projects/` +
      `${FIREBASE_PROJECT_ID}/databases/(default)/documents/` +
      `${collection}/${encodeURIComponent(docId)}` +
      `?${updateMask}&key=${FIREBASE_API_KEY}`;

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: toFirestoreFields(fieldsToUpdate),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        `Firestore update failed for ${collection}/${docId}:`,
        response.status,
        errorText
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      `Firestore update error for ${collection}/${docId}:`,
      error
    );

    return false;
  }
}

async function queryFirestoreByField(
  collection: string,
  fieldPath: string,
  value: string
): Promise<any[]> {
  try {
    const url =
      `https://firestore.googleapis.com/v1/projects/` +
      `${FIREBASE_PROJECT_ID}/databases/(default)/documents:` +
      `runQuery?key=${FIREBASE_API_KEY}`;

    const queryPayload = {
      structuredQuery: {
        from: [
          {
            collectionId: collection,
          },
        ],
        where: {
          fieldFilter: {
            field: {
              fieldPath,
            },
            op: "EQUAL",
            value: {
              stringValue: value,
            },
          },
        },
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(queryPayload),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .filter((item: any) => item.document)
      .map((item: any) => {
        const fields = extractFirestoreFields(
          item.document
        );

        return {
          id: item.document.name?.split("/").pop(),
          ...fields,
        };
      });
  } catch (error) {
    console.warn(
      `Firestore query warning for ${collection}.${fieldPath}:`,
      error
    );

    return [];
  }
}

async function queryFirestoreWalletTransactions(
  uid: string
): Promise<any[]> {
  return queryFirestoreByField(
    "walletTransactions",
    "uid",
    uid
  );
}

// -------------------------------------------------------------
// COMMISSION SETTINGS
// -------------------------------------------------------------

async function getCommissionSettings(): Promise<{
  platformPercentage: number;
  affiliatePercentage: number;
}> {
  const settings = await fetchFirestoreDocument(
    "settings",
    "commissionSettings"
  );

  const platformPercentage = Number(
    settings?.platformPercentage ?? 15
  );

  const affiliatePercentage = Number(
    settings?.affiliatePercentage ?? 5
  );

  if (
    !Number.isFinite(platformPercentage) ||
    platformPercentage < 0 ||
    platformPercentage > 100
  ) {
    return {
      platformPercentage: 15,
      affiliatePercentage: 5,
    };
  }

  if (
    !Number.isFinite(affiliatePercentage) ||
    affiliatePercentage < 0 ||
    affiliatePercentage > 100 ||
    platformPercentage + affiliatePercentage > 100
  ) {
    return {
      platformPercentage,
      affiliatePercentage: 5,
    };
  }

  return {
    platformPercentage,
    affiliatePercentage,
  };
}

// -------------------------------------------------------------
// HEALTH
// -------------------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "Campus Read Server",
    time: new Date().toISOString(),
  });
});

// -------------------------------------------------------------
// MATERIAL UPLOAD
// -------------------------------------------------------------

app.post(
  "/api/materials/upload",
  upload.single("file"),
  async (req, res) => {
    const clientIp =
      req.ip ||
      req.socket.remoteAddress ||
      "unknown";

    if (
      !checkRateLimit(
        `upload_${clientIp}`,
        15,
        10 * 60 * 1000
      )
    ) {
      return res.status(429).json({
        success: false,
        message:
          "Rate limit exceeded. Please wait a few minutes before uploading again.",
      });
    }

    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized: Missing Authorization header.",
        });
      }

      const verifiedAuth =
        await verifyFirebaseIdToken(authHeader);

      if (!verifiedAuth) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized: Invalid or expired Firebase ID token.",
        });
      }

      const authenticatedUid = verifiedAuth.uid;

      const userDoc = await fetchFirestoreDocument(
        "users",
        authenticatedUid,
        authHeader
      );

      const userRole = String(
        userDoc?.role ||
        userDoc?.accountType ||
        userDoc?.userRole ||
        "STUDENT"
      ).trim().toUpperCase();

      const allowedRoles = ["LECTURER", "SUPER_ADMIN", "ADMIN"];

      if (!allowedRoles.includes(userRole)) {
        console.log("UPLOAD BLOCKED", {
          uid: authenticatedUid,
          role: userDoc?.role,
          accountType: userDoc?.accountType,
          userRole: userDoc?.userRole
        });

        return res.status(403).json({
          success: false,
          message: `Forbidden. Detected role: ${userRole}`,
        });
      }

      const file = req.file;

      if (!file?.buffer) {
        return res.status(400).json({
          success: false,
          message:
            "No PDF binary file provided.",
        });
      }

      if (file.size > MAX_PDF_SIZE) {
        return res.status(400).json({
          success: false,
          message:
            "File size exceeds the maximum 50MB allowable limit.",
        });
      }

      const originalName =
        file.originalname || "material.pdf";

      if (
        !originalName
          .toLowerCase()
          .endsWith(".pdf")
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid file extension. Document must have a .pdf extension.",
        });
      }

      if (
        file.mimetype !== "application/pdf" &&
        file.mimetype !== "application/x-pdf"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid MIME type. Must be application/pdf.",
        });
      }

      const header = file.buffer.slice(0, 4);

      const isMagicPdf =
        header[0] === 0x25 &&
        header[1] === 0x50 &&
        header[2] === 0x44 &&
        header[3] === 0x46;

      if (!isMagicPdf) {
        return res.status(400).json({
          success: false,
          message:
            "Corrupt or invalid PDF file header signature.",
        });
      }

      const rawMaterialId =
        req.body.materialId ||
        `mat-${Date.now()}`;

      const safeMaterialId =
        sanitizeMaterialId(rawMaterialId);

      const safeName =
        sanitizeFileName(originalName);

      const targetDir = path.join(
        PRIVATE_STORAGE_DIR,
        authenticatedUid,
        safeMaterialId
      );

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, {
          recursive: true,
        });
      }

      const targetFilePath = path.join(
        targetDir,
        safeName
      );

      const privateRoot = path.resolve(
        PRIVATE_STORAGE_DIR
      );

      const resolvedTarget = path.resolve(
        targetFilePath
      );

      if (
        !resolvedTarget.startsWith(
          privateRoot + path.sep
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid storage destination path.",
        });
      }

      fs.writeFileSync(
        targetFilePath,
        file.buffer
      );

      const meta: MaterialMeta = {
        materialId: safeMaterialId,
        lecturerUid: authenticatedUid,
        originalFileName: originalName,
        safeFileName: safeName,
        filePath: targetFilePath,
        fileSize: file.size,
        mimeType: "application/pdf",
        uploadedAt:
          new Date().toISOString(),
        approvalStatus: "PENDING",
      };

      materialRegistry.set(
        safeMaterialId,
        meta
      );

      return res.json({
        success: true,
        message:
          "Academic PDF material successfully uploaded and securely stored.",
        metadata: {
          materialId: safeMaterialId,
          authorUid: authenticatedUid,
          fileName: originalName,
          fileSize: file.size,
          mimeType: "application/pdf",
          hasPdf: true,
          uploadStatus: "UPLOADED",
          storageIdentifier:
            `${authenticatedUid}/${safeMaterialId}/${safeName}`,
          uploadedAt: meta.uploadedAt,
          approvalStatus: "PENDING",
        },
      });
    } catch (error) {
      console.error(
        "PDF Upload Server Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "An internal server error occurred while storing academic material.",
      });
    }
  }
);

// -------------------------------------------------------------
// PDF STREAMING
// -------------------------------------------------------------

const handlePdfStream = async (
  req: express.Request,
  res: express.Response
) => {
  const clientIp =
    req.ip ||
    req.socket.remoteAddress ||
    "unknown";

  if (
    !checkRateLimit(
      `pdf_stream_${clientIp}`,
      60,
      60 * 1000
    )
  ) {
    return res.status(429).json({
      success: false,
      message:
        "Rate limit exceeded. Please slow down your requests.",
    });
  }

  try {
    const rawMaterialId =
      String(req.params.materialId);

    const safeMaterialId =
      sanitizeMaterialId(rawMaterialId);

    const authHeader =
      req.headers.authorization ||
      (req.query.token as string);

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorized: An active authentication token is required.",
      });
    }

    const verifiedAuth =
      await verifyFirebaseIdToken(
        String(authHeader)
      );

    if (!verifiedAuth) {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorized: Invalid or expired authentication session.",
      });
    }

    const authenticatedUid =
      verifiedAuth.uid;

    const userDoc =
      await fetchFirestoreDocument(
        "users",
        authenticatedUid
      );

    const userRole = String(
      userDoc?.role || "STUDENT"
    ).toUpperCase();

    const bookDoc =
      await fetchFirestoreDocument(
        "books",
        safeMaterialId
      );

    const meta =
      materialRegistry.get(
        safeMaterialId
      );

    const authorUid =
      String(
        bookDoc?.authorUid ||
        meta?.lecturerUid ||
        ""
      );

    const approvalStatus =
      String(
        bookDoc?.approvalStatus ||
        meta?.approvalStatus ||
        "APPROVED"
      ).toUpperCase();

    const isSuperAdmin =
      userRole === "SUPER_ADMIN" ||
      userRole === "ADMIN";

    const isAuthor =
      Boolean(authorUid) &&
      authorUid === authenticatedUid;

    if (!isSuperAdmin && !isAuthor) {
      if (approvalStatus === "PENDING") {
        return res.status(403).json({
          success: false,
          message:
            "Access denied: This material is awaiting moderation.",
        });
      }

      if (approvalStatus === "REJECTED") {
        return res.status(403).json({
          success: false,
          message:
            "Access denied: This material has been rejected.",
        });
      }

      const purchaseIds = [
        `${authenticatedUid}_${safeMaterialId}`,
        `${authenticatedUid}-${safeMaterialId}`,
      ];

      let purchaseDoc = null;

      for (const purchaseId of purchaseIds) {
        purchaseDoc =
          await fetchFirestoreDocument(
            "purchases",
            purchaseId
          );

        if (purchaseDoc) {
          break;
        }
      }

      const hasValidPurchase =
        purchaseDoc &&
        purchaseDoc.studentUid ===
          authenticatedUid &&
        (
          purchaseDoc.bookId ===
            safeMaterialId ||
          purchaseDoc.bookId ===
            rawMaterialId
        );

      if (!hasValidPurchase) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied: You have not purchased this textbook.",
        });
      }
    }

    let targetFile: string | null =
      meta?.filePath || null;

    if (
      !targetFile ||
      !fs.existsSync(targetFile)
    ) {
      const lecturerDirs =
        fs.existsSync(PRIVATE_STORAGE_DIR)
          ? fs.readdirSync(
              PRIVATE_STORAGE_DIR
            )
          : [];

      for (const lecturerDir of lecturerDirs) {
        const materialDir = path.join(
          PRIVATE_STORAGE_DIR,
          lecturerDir,
          safeMaterialId
        );

        if (
          fs.existsSync(materialDir)
        ) {
          const files =
            fs
              .readdirSync(materialDir)
              .filter((file) =>
                file
                  .toLowerCase()
                  .endsWith(".pdf")
              );

          if (files.length > 0) {
            targetFile = path.join(
              materialDir,
              files[0]
            );

            break;
          }
        }
      }
    }

    let pdfBuffer: Buffer;

    if (
      targetFile &&
      fs.existsSync(targetFile)
    ) {
      pdfBuffer =
        fs.readFileSync(targetFile);
    } else {
      return res.status(404).json({
        success: false,
        message:
          "The requested academic PDF could not be found on the secure server.",
      });
    }

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Length",
      pdfBuffer.length
    );

    res.setHeader(
      "Content-Disposition",
      'inline; filename="material.pdf"'
    );

    res.setHeader(
      "Cache-Control",
      "private, no-store, no-cache, must-revalidate, max-age=0"
    );

    res.setHeader(
      "Pragma",
      "no-cache"
    );

    res.setHeader(
      "Expires",
      "0"
    );

    res.setHeader(
      "X-Content-Type-Options",
      "nosniff"
    );

    res.setHeader(
      "X-Frame-Options",
      "SAMEORIGIN"
    );

    return res.send(pdfBuffer);
  } catch (error) {
    console.error(
      "PDF Streaming Server Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "An internal server error occurred while streaming protected material.",
    });
  }
};

app.get(
  "/api/materials/:materialId/pdf",
  handlePdfStream
);

app.post(
  "/api/materials/:materialId/pdf",
  handlePdfStream
);

// -------------------------------------------------------------
// SUPER ADMIN INITIALIZATION
// -------------------------------------------------------------

app.post(
  "/api/admin/init-super-admin",
  async (req, res) => {
    try {
      const initSecretEnv =
        process.env.SUPER_ADMIN_INIT_SECRET;

      if (!initSecretEnv) {
        return res.status(500).json({
          success: false,
          message:
            "Super Admin initialization endpoint is disabled because SUPER_ADMIN_INIT_SECRET is not configured.",
        });
      }

      const {
        initSecret,
        email,
        uid,
        fullName,
      } = req.body;

      if (
        !initSecret ||
        initSecret !== initSecretEnv
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Unauthorized initialization attempt.",
        });
      }

      if (!email || !uid) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required email or uid parameter.",
        });
      }

      return res.json({
        success: true,
        message:
          "Super Admin account profile specification verified.",
        superAdminProfile: {
          uid: String(uid),
          email: String(email)
            .toLowerCase()
            .trim(),
          fullName:
            fullName ||
            "Campus Read Super Admin",
          role: "SUPER_ADMIN",
          accountType: "SUPER_ADMIN",
          status: "ACTIVE",
          createdAt:
            new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error(
        "Super Admin Initialization Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Server error during Super Admin initialization.",
      });
    }
  }
);

// -------------------------------------------------------------
// DIRECT FLUTTERWAVE BOOK PAYMENT
// -------------------------------------------------------------

const processedTransactions =
  new Map<string, any>();

app.post(
  "/api/payment/verify",
  async (req, res) => {
    try {
      const authenticatedUid =
        await requireAuthenticatedUid(req);

      if (!authenticatedUid) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized. Please sign in again.",
        });
      }

      const {
        transactionRef,
        transactionId,
        studentUid,
        bookId,
      } = req.body;

      if (
        !transactionRef ||
        !studentUid ||
        !bookId
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required payment verification parameters.",
        });
      }

      if (
        String(studentUid) !==
        authenticatedUid
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Payment ownership verification failed.",
        });
      }

      const secretKey =
        process.env.FLUTTERWAVE_SECRET_KEY;

      if (
        !secretKey ||
        secretKey.length <= 10 ||
        secretKey.includes("PLACEHOLDER")
      ) {
        return res.status(500).json({
          success: false,
          message:
            "Flutterwave secret key is not configured on the server.",
        });
      }

      const suppliedTransactionId =
        transactionId
          ? String(transactionId).trim()
          : "";

      const suppliedReference =
        String(transactionRef).trim();

      const lookupKey =
        suppliedTransactionId ||
        suppliedReference;

      if (
        processedTransactions.has(
          lookupKey
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This payment transaction has already been processed.",
        });
      }

      let flwData: any;

      try {
        let flwUrl: string;

        if (suppliedTransactionId) {
          flwUrl =
            `https://api.flutterwave.com/v3/transactions/` +
            `${encodeURIComponent(
              suppliedTransactionId
            )}/verify`;
        } else {
          flwUrl =
            `https://api.flutterwave.com/v3/transactions/` +
            `verify_by_reference?tx_ref=${encodeURIComponent(
              suppliedReference
            )}`;
        }

        const flwRes = await fetch(
          flwUrl,
          {
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${secretKey}`,
            },
          }
        );

        if (!flwRes.ok) {
          return res.status(400).json({
            success: false,
            message:
              "Unable to verify transaction with Flutterwave.",
          });
        }

        flwData =
          await flwRes.json();
      } catch (error) {
        console.error(
          "Flutterwave verification connection error:",
          error
        );

        return res.status(502).json({
          success: false,
          message:
            "Unable to connect to Flutterwave payment gateway.",
        });
      }

      if (
        flwData?.status !== "success" ||
        flwData?.data?.status !==
          "successful"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Flutterwave has not marked this payment as successful.",
        });
      }

      const currency = String(
        flwData.data.currency || ""
      ).toUpperCase();

      if (currency !== "NGN") {
        return res.status(400).json({
          success: false,
          message:
            "Transaction currency mismatch. Expected NGN.",
        });
      }

      const verifiedAmount = Number(
        flwData.data.amount
      );

      if (
        !Number.isFinite(
          verifiedAmount
        ) ||
        verifiedAmount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid transaction amount returned by Flutterwave.",
        });
      }

      const verifiedStudentUid =
        flwData.data.meta?.studentUid ||
        flwData.data.meta?.uid;

      if (
        verifiedStudentUid &&
        String(verifiedStudentUid) !==
          authenticatedUid
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Flutterwave transaction ownership does not match the signed-in student.",
        });
      }

      const bookDoc =
        await fetchFirestoreDocument(
          "books",
          String(bookId)
        );

      if (!bookDoc) {
        return res.status(404).json({
          success: false,
          message:
            "Book not found.",
        });
      }

      if (
        String(bookDoc.approvalStatus || "")
          .toUpperCase() !==
        "APPROVED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This textbook is not approved for purchase.",
        });
      }

      const bookPrice = Number(
        bookDoc.price
      );

      if (
        !Number.isFinite(bookPrice) ||
        bookPrice <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid book price.",
        });
      }

      if (
        Math.round(verifiedAmount) !==
        Math.round(bookPrice)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "The verified Flutterwave amount does not match the textbook price.",
        });
      }

      const purchaseId =
        `${authenticatedUid}_${String(
          bookId
        )}`;

      const existingPurchase =
        await fetchFirestoreDocument(
          "purchases",
          purchaseId
        );

      if (existingPurchase) {
        return res.json({
          success: true,
          message:
            "This textbook is already in your digital library.",
          alreadyPurchased: true,
          purchase:
            existingPurchase,
        });
      }

      const authorUid = String(
        bookDoc.authorUid || ""
      );

      if (!authorUid) {
        return res.status(400).json({
          success: false,
          message:
            "The lecturer for this textbook could not be verified.",
        });
      }

      const purchaseDate =
        new Date().toISOString();

      const purchaseDoc = {
        id: purchaseId,
        studentUid:
          authenticatedUid,
        studentName:
          String(
            (
              await fetchFirestoreDocument(
                "users",
                authenticatedUid
              )
            )?.fullName || ""
          ),
        studentEmail:
          String(
            (
              await fetchFirestoreDocument(
                "users",
                authenticatedUid
              )
            )?.email || ""
          ),
        bookId: String(bookId),
        bookTitle: String(
          bookDoc.title ||
            "Academic Material"
        ),
        authorUid,
        price: verifiedAmount,
        transactionRef:
          String(
            flwData.data.tx_ref ||
              suppliedReference
          ),
        flutterwaveTransactionId:
          String(
            flwData.data.id ||
              suppliedTransactionId ||
              suppliedReference
          ),
        purchaseDate,
      };

      const saved =
        await saveFirestoreDocument(
          "purchases",
          purchaseId,
          purchaseDoc
        );

      if (!saved) {
        return res.status(500).json({
          success: false,
          message:
            "Payment was verified, but CampusRead could not record the purchase.",
        });
      }

      processedTransactions.set(
        lookupKey,
        purchaseDoc
      );

      return res.json({
        success: true,
        message:
          "Payment successfully verified by CampusRead Server.",
        purchase: purchaseDoc,
      });
    } catch (error) {
      console.error(
        "Payment verification error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Internal server error occurred during payment verification.",
      });
    }
  }
);

// -------------------------------------------------------------
// BUYER PDF
// -------------------------------------------------------------

function escapePdfText(
  value: string
): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ")
    .slice(0, 180);
}

function buildBuyerListPdf(
  title: string,
  rows: Array<{
    name: string;
    matric: string;
  }>
): Buffer {
  const perPage = 45;

  const pageRows = rows.length
    ? rows
    : [
        {
          name: "No students found",
          matric: "",
        },
      ];

  const pageCount =
    Math.ceil(
      pageRows.length / perPage
    );

  const objects: string[] = [];

  objects[1] =
    "<< /Type /Catalog /Pages 2 0 R >>";

  const pageObjectNumbers: number[] = [];

  for (
    let page = 0;
    page < pageCount;
    page++
  ) {
    const pageObj =
      4 + page * 2;

    const contentObj =
      pageObj + 1;

    pageObjectNumbers.push(
      pageObj
    );

    const pageLines =
      pageRows.slice(
        page * perPage,
        (page + 1) * perPage
      );

    const commands: string[] = [
      "BT",
      "/F1 15 Tf",
      "50 790 Td",
      `(${escapePdfText(
        "CampusRead Buyer List"
      )}) Tj`,
      "/F1 10 Tf",
      "0 -22 Td",
      `(${escapePdfText(title)}) Tj`,
      "0 -18 Td",
      `(${escapePdfText(
        `Generated: ${new Date().toLocaleString()}`
      )}) Tj`,
      "0 -28 Td",
      "(S/N     STUDENT NAME                                      MATRIC NO.) Tj",
      "0 -14 Td",
    ];

    pageLines.forEach(
      (row, index) => {
        const serial = String(
          page * perPage +
            index +
            1
        ).padEnd(7, " ");

        const name = String(
          row.name ||
            "Unknown Student"
        )
          .slice(0, 46)
          .padEnd(49, " ");

        const matric = String(
          row.matric || "—"
        ).slice(0, 28);

        commands.push(
          `(${escapePdfText(
            `${serial}${name}${matric}`
          )}) Tj`,
          "0 -14 Td"
        );
      }
    );

    commands.push("ET");

    const stream =
      commands.join("\n");

    objects[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`;

    objects[contentObj] =
      `<< /Length ${Buffer.byteLength(
        stream,
        "utf8"
      )} >>\nstream\n${stream}\nendstream`;
  }

  objects[2] =
    `<< /Type /Pages /Kids [${pageObjectNumbers
      .map((n) => `${n} 0 R`)
      .join(" ")}] /Count ${pageCount} >>`;

  objects[3] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";

  const maxObject =
    3 + pageCount * 2;

  let pdf = "%PDF-1.4\n";

  const offsets: number[] =
    new Array(
      maxObject + 1
    ).fill(0);

  for (
    let n = 1;
    n <= maxObject;
    n++
  ) {
    offsets[n] =
      Buffer.byteLength(
        pdf,
        "utf8"
      );

    pdf +=
      `${n} 0 obj\n` +
      `${objects[n]}\n` +
      `endobj\n`;
  }

  const xrefOffset =
    Buffer.byteLength(
      pdf,
      "utf8"
    );

  pdf +=
    `xref\n0 ${maxObject + 1}\n`;

  pdf +=
    "0000000000 65535 f \n";

  for (
    let n = 1;
    n <= maxObject;
    n++
  ) {
    pdf +=
      `${String(
        offsets[n]
      ).padStart(10, "0")} 00000 n \n`;
  }

  pdf +=
    `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(
    pdf,
    "utf8"
  );
}

app.get(
  "/api/admin/books/:bookId/buyers.pdf",
  async (req, res) => {
    try {
      const authenticatedUid =
        await requireAuthenticatedUid(req);

      if (!authenticatedUid) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      const admin =
        await fetchFirestoreDocument(
          "users",
          authenticatedUid
        );

      if (
        !admin ||
        !["SUPER_ADMIN", "ADMIN"].includes(
          String(admin.role)
            .toUpperCase()
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Super Admin authorization required.",
        });
      }

      const bookId =
        String(req.params.bookId);

      const book =
        await fetchFirestoreDocument(
          "books",
          bookId
        );

      if (!book) {
        return res.status(404).json({
          success: false,
          message: "Book not found.",
        });
      }

      const purchases =
        await queryFirestoreByField(
          "purchases",
          "bookId",
          bookId
        );

      const rows =
        purchases
          .map((purchase: any) => ({
            name: String(
              purchase.studentName ||
                purchase.studentUid ||
                "Unknown Student"
            ),
            matric: String(
              purchase.studentMatricNumber ||
                "—"
            ),
          }))
          .sort((a, b) =>
            a.name.localeCompare(
              b.name
            )
          );

      const pdf =
        buildBuyerListPdf(
          String(
            book.title ||
              "Academic Book"
          ),
          rows
        );

      res.setHeader(
        "Content-Type",
        "application/pdf"
      );

      res.setHeader(
        "Content-Length",
        pdf.length
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="campusread-buyers-${sanitizeMaterialId(
          bookId
        )}.pdf"`
      );

      res.setHeader(
        "Cache-Control",
        "private, no-store"
      );

      return res.send(pdf);
    } catch (error) {
      console.error(
        "Buyer PDF generation error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not generate buyer PDF.",
      });
    }
  }
);

// -------------------------------------------------------------
// LECTURER WITHDRAWAL
// -------------------------------------------------------------

app.post(
  "/api/lecturer/withdrawal",
  async (req, res) => {
    try {
      const authenticatedUid =
        await requireAuthenticatedUid(req);

      if (!authenticatedUid) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized. Please sign in again.",
        });
      }

      const {
        userUid,
        amount,
      } = req.body;

      if (
        !userUid ||
        userUid !== authenticatedUid
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid lecturer withdrawal request.",
        });
      }

      const lecturer =
        await fetchFirestoreDocument(
          "users",
          authenticatedUid
        );

      if (
        !lecturer ||
        lecturer.role !== "LECTURER" ||
        lecturer.status !== "ACTIVE"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only active lecturers can request withdrawals.",
        });
      }

      const requestedAmount =
        Math.round(Number(amount));

      if (
        !Number.isFinite(
          requestedAmount
        ) ||
        requestedAmount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid withdrawal amount.",
        });
      }

      const withdrawals =
        await queryFirestoreByField(
          "withdrawals",
          "userUid",
          authenticatedUid
        );

      const pendingAmount =
        withdrawals
          .filter(
            (w: any) =>
              w.status === "PENDING"
          )
          .reduce(
            (sum: number, w: any) =>
              sum +
              Number(w.amount || 0),
            0
          );

      const balance =
        Number(
          lecturer.earningsBalance || 0
        );

      const available =
        balance - pendingAmount;

      if (
        requestedAmount >
        available
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Insufficient available earnings. Available for withdrawal: ₦${Math.max(
              0,
              available
            ).toLocaleString()}.`,
        });
      }

      if (
        !lecturer.bankName ||
        !lecturer.accountNumber ||
        !lecturer.accountName
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Complete your registered bank details before requesting withdrawal.",
        });
      }

      const withdrawalId =
        `wd-${authenticatedUid}-${Date.now()}`;

      const requestedAt =
        new Date().toISOString();

      const withdrawal = {
        id: withdrawalId,
        userUid: authenticatedUid,
        userName:
          lecturer.fullName ||
          "Lecturer",
        userRole: "LECTURER",
        bankName:
          lecturer.bankName,
        accountNumber:
          lecturer.accountNumber,
        accountName:
          lecturer.accountName ||
          lecturer.fullName ||
          "",
        amount:
          requestedAmount,
        status: "PENDING",
        requestedAt,
      };

      const saved =
        await saveFirestoreDocument(
          "withdrawals",
          withdrawalId,
          withdrawal
        );

      if (!saved) {
        return res.status(500).json({
          success: false,
          message:
            "Could not record withdrawal request.",
        });
      }

      return res.json({
        success: true,
        message:
          "Withdrawal request submitted for Super Admin approval.",
        withdrawal,
      });
    } catch (error) {
      console.error(
        "Lecturer withdrawal request error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not submit withdrawal request.",
      });
    }
  }
);

// -------------------------------------------------------------
// APPROVE WITHDRAWAL
// -------------------------------------------------------------

app.post(
  "/api/admin/withdrawals/:withdrawalId/approve",
  async (req, res) => {
    try {
      const authenticatedUid =
        await requireAuthenticatedUid(req);

      if (!authenticatedUid) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      const admin =
        await fetchFirestoreDocument(
          "users",
          authenticatedUid
        );

      if (
        !admin ||
        !["SUPER_ADMIN", "ADMIN"].includes(
          String(admin.role)
            .toUpperCase()
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Super Admin authorization required.",
        });
      }

      const withdrawalId =
        String(
          req.params.withdrawalId
        );

      const withdrawal =
        await fetchFirestoreDocument(
          "withdrawals",
          withdrawalId
        );

      if (
        !withdrawal ||
        withdrawal.status !==
          "PENDING"
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Pending withdrawal request not found.",
        });
      }

      const lecturer =
        await fetchFirestoreDocument(
          "users",
          withdrawal.userUid
        );

      if (
        !lecturer ||
        lecturer.role !== "LECTURER"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Lecturer account could not be verified.",
        });
      }

      const amount =
        Number(withdrawal.amount);

      const balance =
        Number(
          lecturer.earningsBalance || 0
        );

      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        balance < amount
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Lecturer earnings balance is insufficient for this payout.",
        });
      }

      const secretKey =
        process.env.FLUTTERWAVE_SECRET_KEY;

      if (
        !secretKey ||
        secretKey.length <= 10 ||
        secretKey.includes("PLACEHOLDER")
      ) {
        return res.status(500).json({
          success: false,
          message:
            "Flutterwave secret key is not configured on the server.",
        });
      }

      const banksRes =
        await fetch(
          "https://api.flutterwave.com/v3/banks/NG",
          {
            headers: {
              Authorization:
                `Bearer ${secretKey}`,
            },
          }
        );

      if (!banksRes.ok) {
        return res.status(502).json({
          success: false,
          message:
            "Could not retrieve Nigerian bank list from Flutterwave.",
        });
      }

      const banksData =
        await banksRes.json();

      const normalizedBank =
        String(
          withdrawal.bankName || ""
        )
          .toLowerCase()
          .replace(
            /[^a-z0-9]/g,
            ""
          );

      const bank =
        (banksData.data || []).find(
          (b: any) => {
            const name =
              String(b.name || "")
                .toLowerCase()
                .replace(
                  /[^a-z0-9]/g,
                  ""
                );

            return (
              name ===
                normalizedBank ||
              name.includes(
                normalizedBank
              ) ||
              normalizedBank.includes(
                name
              )
            );
          }
        );

      if (!bank?.code) {
        return res.status(400).json({
          success: false,
          message:
            `Could not match "${withdrawal.bankName}" to a Flutterwave bank code.`,
        });
      }

      const transferReference =
        `CR-WD-${withdrawalId}-${Date.now()}`;

      const transferRes =
        await fetch(
          "https://api.flutterwave.com/v3/transfers",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${secretKey}`,
            },
            body: JSON.stringify({
              account_bank:
                String(bank.code),
              account_number:
                String(
                  withdrawal.accountNumber
                ),
              amount,
              currency: "NGN",
              beneficiary_name:
                withdrawal.accountName,
              narration:
                `CampusRead lecturer withdrawal - ${withdrawal.userName}`,
              reference:
                transferReference,
              debit_currency: "NGN",
            }),
          }
        );

      const transferData =
        await transferRes.json();

      if (
        !transferRes.ok ||
        transferData?.status !==
          "success"
      ) {
        console.error(
          "Flutterwave transfer failed:",
          transferData
        );

        return res.status(502).json({
          success: false,
          message:
            transferData?.message ||
            "Flutterwave could not initiate the bank transfer.",
        });
      }

      const newBalance =
        balance - amount;

      const updated =
        await updateFirestoreFields(
          "users",
          withdrawal.userUid,
          {
            earningsBalance:
              newBalance,
            updatedAt:
              new Date().toISOString(),
          }
        );

      if (!updated) {
        return res.status(500).json({
          success: false,
          message:
            "Bank transfer was initiated, but the lecturer wallet could not be updated. Do not approve this request again; reconcile the transfer first.",
        });
      }

      const withdrawalUpdated =
        await updateFirestoreFields(
          "withdrawals",
          withdrawalId,
          {
            status: "APPROVED",
            processedAt:
              new Date().toISOString(),
            transferReference,
            flutterwaveTransferId:
              String(
                transferData?.data?.id ||
                  ""
              ),
            processedBy:
              authenticatedUid,
          }
        );

      if (!withdrawalUpdated) {
        return res.status(500).json({
          success: false,
          message:
            "Transfer was initiated and lecturer balance updated, but the withdrawal status could not be saved. Reconcile this payout before retrying.",
        });
      }

      await saveFirestoreDocument(
        "walletTransactions",
        `wd_${withdrawalId}`,
        {
          id: `wd_${withdrawalId}`,
          uid: withdrawal.userUid,
          reference:
            transferReference,
          flutterwaveTransactionId:
            String(
              transferData?.data?.id ||
                transferReference
            ),
          amount,
          currency: "NGN",
          type: "WITHDRAWAL",
          status: "SUCCESS",
          paymentProvider:
            "FLUTTERWAVE",
          createdAt:
            new Date().toISOString(),
          verifiedAt:
            new Date().toISOString(),
          description:
            `Lecturer withdrawal to ${withdrawal.bankName}`,
        }
      );

      await saveFirestoreDocument(
        "auditLogs",
        `withdrawal_${withdrawalId}`,
        {
          action:
            "LECTURER_WITHDRAWAL_APPROVED",
          actorId:
            authenticatedUid,
          actorRole:
            admin.role,
          timestamp:
            new Date().toISOString(),
          details:
            `Approved and initiated ₦${amount.toLocaleString()} payout for ${withdrawal.userName}.`,
          referenceId:
            withdrawalId,
        }
      );

      return res.json({
        success: true,
        message:
          "Withdrawal approved and bank transfer initiated successfully.",
        transferReference,
        newBalance,
      });
    } catch (error) {
      console.error(
        "Withdrawal approval error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not approve withdrawal.",
      });
    }
  }
);

// -------------------------------------------------------------
// REJECT WITHDRAWAL
// -------------------------------------------------------------

app.post(
  "/api/admin/withdrawals/:withdrawalId/reject",
  async (req, res) => {
    try {
      const authenticatedUid =
        await requireAuthenticatedUid(req);

      if (!authenticatedUid) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      const admin =
        await fetchFirestoreDocument(
          "users",
          authenticatedUid
        );

      if (
        !admin ||
        !["SUPER_ADMIN", "ADMIN"].includes(
          String(admin.role)
            .toUpperCase()
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Super Admin authorization required.",
        });
      }

      const withdrawalId =
        String(
          req.params.withdrawalId
        );

      const withdrawal =
        await fetchFirestoreDocument(
          "withdrawals",
          withdrawalId
        );

      if (
        !withdrawal ||
        withdrawal.status !==
          "PENDING"
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Pending withdrawal request not found.",
        });
      }

      const updated =
        await updateFirestoreFields(
          "withdrawals",
          withdrawalId,
          {
            status: "REJECTED",
            processedAt:
              new Date().toISOString(),
            processedBy:
              authenticatedUid,
          }
        );

      if (!updated) {
        return res.status(500).json({
          success: false,
          message:
            "Could not update withdrawal status.",
        });
      }

      await saveFirestoreDocument(
        "auditLogs",
        `withdrawal_rejected_${withdrawalId}`,
        {
          action:
            "LECTURER_WITHDRAWAL_REJECTED",
          actorId:
            authenticatedUid,
          actorRole:
            admin.role,
          timestamp:
            new Date().toISOString(),
          details:
            `Rejected withdrawal request for ${withdrawal.userName}.`,
          referenceId:
            withdrawalId,
        }
      );

      return res.json({
        success: true,
        message:
          "Withdrawal request rejected.",
      });
    } catch (error) {
      console.error(
        "Withdrawal rejection error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not reject withdrawal request.",
      });
    }
  }
);

// =============================================================
// WALLET FUNDING
// =============================================================

const processedWalletTransactions =
  new Map<string, any>();

function getFlutterwaveSecretKey():
  string | null {
  const secret =
    process.env.FLUTTERWAVE_SECRET_KEY;

  if (
    !secret ||
    secret.length <= 10 ||
    secret.includes("PLACEHOLDER")
  ) {
    return null;
  }

  return secret;
}

function canonicalWalletTransactionId(
  transactionId: string
): string {
  const clean =
    String(transactionId)
      .trim()
      .replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      );

  return `flw_${clean}`;
}

// -------------------------------------------------------------
// VERIFY WALLET FUNDING
// -------------------------------------------------------------

app.post(
  "/api/wallet/verify-flutterwave",
  async (req, res) => {
    const clientIp =
      req.ip ||
      req.socket.remoteAddress ||
      "unknown";

    if (
      !checkRateLimit(
        `wallet_verify_${clientIp}`,
        30,
        60 * 1000
      )
    ) {
      return res.status(429).json({
        success: false,
        message:
          "Rate limit exceeded. Please wait before retrying payment verification.",
      });
    }

    try {
      const authenticatedUid =
        await requireAuthenticatedUid(req);

      if (!authenticatedUid) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized. Please sign in again.",
        });
      }

      const {
        transactionId,
        transactionRef,
        studentUid,
        expectedAmount,
      } = req.body;

      if (
        !transactionId &&
        !transactionRef
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Missing Flutterwave transaction ID or reference.",
        });
      }

      if (!studentUid) {
        return res.status(400).json({
          success: false,
          message:
            "Missing student UID.",
        });
      }

      // NEVER trust a browser-supplied UID.
      if (
        String(studentUid) !==
        authenticatedUid
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Payment ownership verification failed.",
        });
      }

      // ---------------------------------------------------------
      // VALIDATE REQUESTED AMOUNT
      // ---------------------------------------------------------

      const requestedAmount =
        Number(expectedAmount);

      if (
        !Number.isFinite(
          requestedAmount
        ) ||
        requestedAmount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid wallet funding amount.",
        });
      }

      if (
        !Number.isInteger(
          requestedAmount
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Wallet funding amount must be a whole number.",
        });
      }

      if (
        requestedAmount <
        MIN_WALLET_FUNDING
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Minimum wallet funding amount is ₦${MIN_WALLET_FUNDING.toLocaleString()}.`,
        });
      }

      // ---------------------------------------------------------
      // FLUTTERWAVE SECRET MUST EXIST
      // ---------------------------------------------------------

      const secretKey =
        getFlutterwaveSecretKey();

      if (!secretKey) {
        return res.status(500).json({
          success: false,
          message:
            "Flutterwave secret key is not configured on the server.",
        });
      }

      const suppliedTransactionId =
        transactionId
          ? String(
              transactionId
            ).trim()
          : "";

      const suppliedReference =
        transactionRef
          ? String(
              transactionRef
            ).trim()
          : "";

      const initialKey =
        suppliedTransactionId ||
        suppliedReference;

      // ---------------------------------------------------------
      // VERIFY TRANSACTION WITH FLUTTERWAVE
      // ---------------------------------------------------------

      let flwData: any;

      try {
        let flwUrl: string;

        if (suppliedTransactionId) {
          flwUrl =
            `https://api.flutterwave.com/v3/transactions/` +
            `${encodeURIComponent(
              suppliedTransactionId
            )}/verify`;
        } else {
          flwUrl =
            `https://api.flutterwave.com/v3/transactions/` +
            `verify_by_reference?tx_ref=${encodeURIComponent(
              suppliedReference
            )}`;
        }

        const flwRes =
          await fetch(flwUrl, {
            method: "GET",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${secretKey}`,
            },
          });

        const responseText =
          await flwRes.text();

        if (!flwRes.ok) {
          console.error(
            "Flutterwave verification failed:",
            flwRes.status,
            responseText
          );

          return res.status(400).json({
            success: false,
            message:
              "Unable to verify transaction with Flutterwave.",
          });
        }

        try {
          flwData =
            JSON.parse(
              responseText
            );
        } catch {
          return res.status(502).json({
            success: false,
            message:
              "Flutterwave returned an invalid verification response.",
          });
        }
      } catch (error) {
        console.error(
          "Flutterwave connection error:",
          error
        );

        return res.status(502).json({
          success: false,
          message:
            "Unable to connect to Flutterwave payment gateway.",
        });
      }

      // ---------------------------------------------------------
      // VERIFY SUCCESS STATUS
      // ---------------------------------------------------------

      if (
        flwData?.status !==
          "success" ||
        flwData?.data?.status !==
          "successful"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Flutterwave has not marked this payment as successful.",
        });
      }

      const flwCurrency =
        String(
          flwData.data.currency ||
            ""
        ).toUpperCase();

      if (flwCurrency !== "NGN") {
        return res.status(400).json({
          success: false,
          message:
            "Transaction currency mismatch. Expected NGN.",
        });
      }

      // ---------------------------------------------------------
      // USE ONLY AMOUNT RETURNED BY FLUTTERWAVE
      // ---------------------------------------------------------

      const verifiedAmount =
        Number(
          flwData.data.amount
        );

      if (
        !Number.isFinite(
          verifiedAmount
        ) ||
        verifiedAmount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid amount returned by Flutterwave.",
        });
      }

      if (
        verifiedAmount <
        MIN_WALLET_FUNDING
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Flutterwave payment is below the CampusRead minimum funding amount of ₦${MIN_WALLET_FUNDING.toLocaleString()}.`,
        });
      }

      // Prevent browser from saying ₦5,000
      // while actual payment was ₦100.
      if (
        Math.round(
          verifiedAmount
        ) !==
        Math.round(
          requestedAmount
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Payment amount mismatch. CampusRead requested ₦${requestedAmount.toLocaleString()} but Flutterwave confirmed ₦${verifiedAmount.toLocaleString()}.`,
        });
      }

      // ---------------------------------------------------------
      // AUTHORITATIVE FLUTTERWAVE IDENTIFIERS
      // ---------------------------------------------------------

      const flwTxId =
        String(
          flwData.data.id ||
            suppliedTransactionId ||
            suppliedReference
        );

      const flwTxRef =
        String(
          flwData.data.tx_ref ||
            suppliedReference ||
            flwTxId
        );

      const docId =
        canonicalWalletTransactionId(
          flwTxId
        );

      const alternateRefDocId =
        canonicalWalletTransactionId(
          flwTxRef
        );

      // ---------------------------------------------------------
      // VERIFY FLUTTERWAVE METADATA OWNERSHIP
      // ---------------------------------------------------------

      const metadataUid =
        flwData.data.meta?.studentUid ||
        flwData.data.meta?.uid ||
        "";

      if (
        metadataUid &&
        String(metadataUid) !==
          authenticatedUid
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Flutterwave payment belongs to a different CampusRead account.",
        });
      }

      // ---------------------------------------------------------
      // DUPLICATE PROTECTION
      // ---------------------------------------------------------

      const cached =
        processedWalletTransactions.get(
          flwTxId
        ) ||
        processedWalletTransactions.get(
          flwTxRef
        ) ||
        processedWalletTransactions.get(
          docId
        ) ||
        processedWalletTransactions.get(
          alternateRefDocId
        );

      if (
        cached &&
        cached.status ===
          "SUCCESS"
      ) {
        const userDoc =
          await fetchFirestoreDocument(
            "users",
            authenticatedUid
          );

        return res.json({
          success: true,
          message:
            "Transaction has already been verified and credited.",
          alreadyProcessed: true,
          walletBalance:
            Number(
              userDoc?.walletBalance ||
                0
            ),
          transaction: cached,
        });
      }

      // Check canonical transaction.
      const existingCanonical =
        await fetchFirestoreDocument(
          "walletTransactions",
          docId
        );

      if (
        existingCanonical &&
        existingCanonical.status ===
          "SUCCESS"
      ) {
        if (
          existingCanonical.uid !==
          authenticatedUid
        ) {
          return res.status(403).json({
            success: false,
            message:
              "This transaction belongs to another CampusRead account.",
          });
        }

        processedWalletTransactions.set(
          flwTxId,
          existingCanonical
        );

        processedWalletTransactions.set(
          flwTxRef,
          existingCanonical
        );

        const userDoc =
          await fetchFirestoreDocument(
            "users",
            authenticatedUid
          );

        return res.json({
          success: true,
          message:
            "This Flutterwave payment was previously processed and credited.",
          alreadyProcessed: true,
          walletBalance:
            Number(
              userDoc?.walletBalance ||
                0
            ),
          transaction:
            existingCanonical,
        });
      }

      // Check reference-based transaction
      // for compatibility with older records.
      const existingReference =
        await fetchFirestoreDocument(
          "walletTransactions",
          alternateRefDocId
        );

      if (
        existingReference &&
        existingReference.status ===
          "SUCCESS"
      ) {
        if (
          existingReference.uid !==
          authenticatedUid
        ) {
          return res.status(403).json({
            success: false,
            message:
              "This transaction belongs to another CampusRead account.",
          });
        }

        processedWalletTransactions.set(
          flwTxId,
          existingReference
        );

        processedWalletTransactions.set(
          flwTxRef,
          existingReference
        );

        const userDoc =
          await fetchFirestoreDocument(
            "users",
            authenticatedUid
          );

        return res.json({
          success: true,
          message:
            "This Flutterwave payment was previously processed and credited.",
          alreadyProcessed: true,
          walletBalance:
            Number(
              userDoc?.walletBalance ||
                0
            ),
          transaction:
            existingReference,
        });
      }

      // ---------------------------------------------------------
      // FETCH STUDENT
      // ---------------------------------------------------------

      const studentUser =
        await fetchFirestoreDocument(
          "users",
          authenticatedUid
        );

      if (!studentUser) {
        return res.status(404).json({
          success: false,
          message:
            "Student account not found in CampusRead database.",
        });
      }

      if (
        String(
          studentUser.role ||
            ""
        ).toUpperCase() !==
        "STUDENT"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only student accounts can fund a student wallet.",
        });
      }

      // ---------------------------------------------------------
      // CALCULATE NEW BALANCE
      // ---------------------------------------------------------

      const currentBalance =
        Number(
          studentUser.walletBalance ||
            0
        );

      if (
        !Number.isFinite(
          currentBalance
        ) ||
        currentBalance < 0
      ) {
        return res.status(500).json({
          success: false,
          message:
            "Invalid current wallet balance in CampusRead database.",
        });
      }

      const newBalance =
        currentBalance +
        verifiedAmount;

      const verifiedAt =
        new Date().toISOString();

      // ---------------------------------------------------------
      // CREATE TRANSACTION RECORD
      // ---------------------------------------------------------

      const walletTxRecord = {
        id: docId,
        uid: authenticatedUid,
        reference: flwTxRef,
        flutterwaveTransactionId:
          flwTxId,
        amount: verifiedAmount,
        currency: "NGN",
        type: "WALLET_FUNDING",
        status: "SUCCESS",
        paymentProvider:
          "FLUTTERWAVE",
        createdAt:
          flwData.data.created_at ||
          verifiedAt,
        verifiedAt,
        description:
          `CampusRead Wallet Funding (₦${verifiedAmount.toLocaleString()})`,
      };

      // ---------------------------------------------------------
      // SAVE TRANSACTION FIRST
      // ---------------------------------------------------------

      const transactionSaved =
        await saveFirestoreDocument(
          "walletTransactions",
          docId,
          walletTxRecord
        );

      if (!transactionSaved) {
        return res.status(500).json({
          success: false,
          message:
            "Payment was confirmed by Flutterwave, but CampusRead could not record the wallet transaction. Your wallet was NOT credited.",
        });
      }

      // ---------------------------------------------------------
      // UPDATE WALLET BALANCE
      // ---------------------------------------------------------

      const walletUpdated =
        await updateFirestoreFields(
          "users",
          authenticatedUid,
          {
            walletBalance:
              newBalance,
            updatedAt:
              verifiedAt,
          }
        );

      if (!walletUpdated) {
        console.error(
          "CRITICAL: Transaction saved but wallet balance update failed.",
          {
            uid:
              authenticatedUid,
            transactionId:
              flwTxId,
            reference:
              flwTxRef,
            amount:
              verifiedAmount,
          }
        );

        return res.status(500).json({
          success: false,
          message:
            "Payment was verified and recorded, but the wallet balance could not be updated. Please contact CampusRead support with your Flutterwave reference.",
          transactionRecorded:
            true,
          transactionReference:
            flwTxRef,
        });
      }

      // ---------------------------------------------------------
      // CACHE ONLY AFTER BOTH WRITES SUCCEED
      // ---------------------------------------------------------

      processedWalletTransactions.set(
        flwTxId,
        walletTxRecord
      );

      processedWalletTransactions.set(
        flwTxRef,
        walletTxRecord
      );

      processedWalletTransactions.set(
        docId,
        walletTxRecord
      );

      processedWalletTransactions.set(
        alternateRefDocId,
        walletTxRecord
      );

      console.log(
        `[WALLET CREDIT SUCCESS] UID=${authenticatedUid} REF=${flwTxRef} TX=${flwTxId} AMOUNT=₦${verifiedAmount}`
      );

      return res.json({
        success: true,
        message:
          "Payment successfully verified by Flutterwave and student wallet credited.",
        verifiedAmount,
        walletBalance:
          newBalance,
        transaction:
          walletTxRecord,
      });
    } catch (error) {
      console.error(
        "Wallet verification server error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Internal server error occurred during Flutterwave payment verification.",
      });
    }
  }
);

// =============================================================
// FLUTTERWAVE WEBHOOK
// =============================================================

app.post(
  "/api/payments/flutterwave-webhook",
  async (req, res) => {
    try {
      const signature =
        String(
          req.headers[
            "verif-hash"
          ] || ""
        );

      const secretHash =
        process.env
          .FLUTTERWAVE_SECRET_HASH ||
        process.env
          .FLUTTERWAVE_SECRET_KEY;

      // If webhook secret is configured,
      // signature is mandatory.
      if (secretHash) {
        if (
          !signature ||
          signature !==
            secretHash
        ) {
          return res.status(401).json({
            status: "error",
            message:
              "Invalid webhook signature.",
          });
        }
      }

      const payload =
        req.body;

      if (
        !payload ||
        !payload.data
      ) {
        return res.status(200).json({
          status: "ok",
          message:
            "Ignored empty payload.",
        });
      }

      const {
        event,
        data,
      } = payload;

      if (
        event !==
        "charge.completed"
      ) {
        return res.status(200).json({
          status: "ok",
          message:
            "Event ignored.",
        });
      }

      if (
        String(
          data.status || ""
        ).toLowerCase() !==
        "successful"
      ) {
        return res.status(200).json({
          status: "ok",
          message:
            "Payment is not successful.",
        });
      }

      if (
        String(
          data.currency || ""
        ).toUpperCase() !==
        "NGN"
      ) {
        return res.status(200).json({
          status: "ok",
          message:
            "Non-NGN transaction ignored.",
        });
      }

      const txId =
        String(data.id || "");

      const txRef =
        String(
          data.tx_ref || ""
        );

      const amount =
        Number(data.amount);

      if (
        !txId ||
        !txRef ||
        !Number.isFinite(
          amount
        ) ||
        amount <= 0
      ) {
        return res.status(200).json({
          status: "ok",
          message:
            "Invalid payment payload.",
        });
      }

      if (
        amount <
        MIN_WALLET_FUNDING
      ) {
        return res.status(200).json({
          status: "ok",
          message:
            "Wallet funding amount is below CampusRead minimum.",
        });
      }

      // Wallet funding must contain the
      // CampusRead student UID in metadata.
      const studentUid =
        String(
          data.meta?.studentUid ||
            data.meta?.uid ||
            ""
        );

      if (!studentUid) {
        return res.status(200).json({
          status: "ok",
          message:
            "Payment does not contain CampusRead student metadata.",
        });
      }

      const docId =
        canonicalWalletTransactionId(
          txId
        );

      if (
        processedWalletTransactions.has(
          txId
        ) ||
        processedWalletTransactions.has(
          docId
        )
      ) {
        return res.status(200).json({
          status: "ok",
          message:
            "Already processed.",
        });
      }

      const existing =
        await fetchFirestoreDocument(
          "walletTransactions",
          docId
        );

      if (
        existing &&
        existing.status ===
          "SUCCESS"
      ) {
        processedWalletTransactions.set(
          txId,
          existing
        );

        return res.status(200).json({
          status: "ok",
          message:
            "Already processed.",
        });
      }

      const studentUser =
        await fetchFirestoreDocument(
          "users",
          studentUid
        );

      if (!studentUser) {
        console.error(
          "Webhook student not found:",
          studentUid
        );

        return res.status(200).json({
          status: "ok",
          message:
            "Student account not found.",
        });
      }

      if (
        String(
          studentUser.role ||
            ""
        ).toUpperCase() !==
        "STUDENT"
      ) {
        return res.status(200).json({
          status: "ok",
          message:
            "Account is not a student.",
        });
      }

      const currentBalance =
        Number(
          studentUser.walletBalance ||
            0
        );

      const newBalance =
        currentBalance +
        amount;

      const verifiedAt =
        new Date().toISOString();

      const walletTxRecord = {
        id: docId,
        uid: studentUid,
        reference: txRef,
        flutterwaveTransactionId:
          txId,
        amount,
        currency: "NGN",
        type: "WALLET_FUNDING",
        status: "SUCCESS",
        paymentProvider:
          "FLUTTERWAVE",
        createdAt:
          data.created_at ||
          verifiedAt,
        verifiedAt,
        description:
          `CampusRead Wallet Funding (₦${amount.toLocaleString()})`,
      };

      const transactionSaved =
        await saveFirestoreDocument(
          "walletTransactions",
          docId,
          walletTxRecord
        );

      if (!transactionSaved) {
        console.error(
          "Webhook transaction record failed:",
          txId
        );

        return res.status(200).json({
          status: "error",
          message:
            "Transaction could not be recorded.",
        });
      }

      const walletUpdated =
        await updateFirestoreFields(
          "users",
          studentUid,
          {
            walletBalance:
              newBalance,
            updatedAt:
              verifiedAt,
          }
        );

      if (!walletUpdated) {
        console.error(
          "CRITICAL WEBHOOK WALLET UPDATE FAILURE:",
          {
            studentUid,
            txId,
            txRef,
            amount,
          }
        );

        return res.status(200).json({
          status: "error",
          message:
            "Wallet balance update failed.",
        });
      }

      processedWalletTransactions.set(
        txId,
        walletTxRecord
      );

      processedWalletTransactions.set(
        txRef,
        walletTxRecord
      );

      processedWalletTransactions.set(
        docId,
        walletTxRecord
      );

      console.log(
        `[WEBHOOK WALLET CREDIT] UID=${studentUid} REF=${txRef} AMOUNT=₦${amount}`
      );

      return res.status(200).json({
        status: "ok",
        message:
          "Wallet funding reconciled successfully.",
      });
    } catch (error) {
      console.error(
        "Webhook processing error:",
        error
      );

      return res.status(200).json({
        status: "error",
      });
    }
  }
);

// =============================================================
// WALLET BOOK PURCHASE
// =============================================================

app.post(
  "/api/wallet/purchase-book",
  async (req, res) => {
    try {
      const authenticatedUid =
        await requireAuthenticatedUid(req);

      if (!authenticatedUid) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized. Please sign in again.",
        });
      }

      const {
        studentUid,
        bookId,
        affiliateCode,
      } = req.body;

      if (
        !studentUid ||
        !bookId ||
        studentUid !==
          authenticatedUid
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid student purchase request.",
        });
      }

      const purchaseDocId =
        `${studentUid}_${bookId}`;

      const existingPurchase =
        await fetchFirestoreDocument(
          "purchases",
          purchaseDocId
        );

      const studentUser =
        await fetchFirestoreDocument(
          "users",
          studentUid
        );

      if (
        !studentUser ||
        String(
          studentUser.role
        ).toUpperCase() !==
          "STUDENT"
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Student account not found.",
        });
      }

      if (existingPurchase) {
        return res.json({
          success: true,
          message:
            "This textbook is already in your digital library.",
          alreadyPurchased: true,
          walletBalance:
            Number(
              studentUser.walletBalance ||
                0
            ),
          purchase:
            existingPurchase,
        });
      }

      const bookDoc =
        await fetchFirestoreDocument(
          "books",
          String(bookId)
        );

      if (
        !bookDoc ||
        String(
          bookDoc.approvalStatus ||
            ""
        ).toUpperCase() !==
          "APPROVED"
      ) {
        return res.status(404).json({
          success: false,
          message:
            "This textbook is not available for purchase.",
        });
      }

      const bookPrice =
        Number(bookDoc.price);

      if (
        !Number.isFinite(
          bookPrice
        ) ||
        bookPrice <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This textbook has an invalid price.",
        });
      }

      const currentBal =
        Number(
          studentUser.walletBalance ||
            0
        );

      if (
        !Number.isFinite(
          currentBal
        ) ||
        currentBal < bookPrice
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Insufficient wallet balance. You have ₦${currentBal.toLocaleString()} but this book costs ₦${bookPrice.toLocaleString()}.`,
        });
      }

      const authorUid =
        String(
          bookDoc.authorUid || ""
        );

      const authorUser =
        authorUid
          ? await fetchFirestoreDocument(
              "users",
              authorUid
            )
          : null;

      if (
        !authorUser ||
        String(
          authorUser.role
        ).toUpperCase() !==
          "LECTURER"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "The lecturer account for this book could not be verified.",
        });
      }

      let affiliateId:
        | string
        | undefined;

      let validAffiliate =
        false;

      if (
        affiliateCode &&
        typeof affiliateCode ===
          "string"
      ) {
        const affiliates =
          await queryFirestoreByField(
            "users",
            "affiliateCode",
            affiliateCode
              .trim()
              .toUpperCase()
          );

        const affiliate =
          affiliates.find(
            (u: any) =>
              String(
                u.role
              ).toUpperCase() ===
                "AFFILIATE" &&
              String(
                u.status
              ).toUpperCase() ===
                "ACTIVE"
          );

        if (
          affiliate &&
          affiliate.uid !==
            studentUid
        ) {
          affiliateId =
            affiliate.uid;

          validAffiliate = true;
        }
      }

      const commission =
        await getCommissionSettings();

      const platformPercentage =
        commission.platformPercentage;

      const affiliatePercentage =
        validAffiliate
          ? commission.affiliatePercentage
          : 0;

      const lecturerPercentage =
        100 -
        platformPercentage -
        affiliatePercentage;

      const platformAmount =
        Math.round(
          bookPrice *
            platformPercentage /
            100
        );

      const affiliateAmount =
        Math.round(
          bookPrice *
            affiliatePercentage /
            100
        );

      const lecturerAmount =
        bookPrice -
        platformAmount -
        affiliateAmount;

      const purchaseDate =
        new Date().toISOString();

      const txRef =
        `WAL-PUR-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;

      const purchaseRecord = {
        id: purchaseDocId,
        studentUid,
        studentName:
          String(
            studentUser.fullName ||
              ""
          ),
        studentMatricNumber:
          String(
            studentUser.matricNumber ||
              ""
          ),
        studentEmail:
          String(
            studentUser.email ||
              ""
          ),
        bookId,
        bookTitle:
          String(
            bookDoc.title ||
              "Academic Textbook"
          ),
        authorUid,
        affiliateId:
          affiliateId || null,
        price: bookPrice,
        platformAmount,
        affiliateAmount,
        lecturerAmount,
        commissionSnapshot: {
          platformPercentage,
          affiliatePercentage,
          lecturerPercentage,
        },
        transactionRef:
          txRef,
        purchaseDate,
      };

      const balanceAfterPurchase =
        currentBal -
        bookPrice;

      const studentUpdated =
        await updateFirestoreFields(
          "users",
          studentUid,
          {
            walletBalance:
              balanceAfterPurchase,
            updatedAt:
              purchaseDate,
          }
        );

      if (!studentUpdated) {
        return res.status(500).json({
          success: false,
          message:
            "Could not debit the student wallet.",
        });
      }

      const lecturerBalance =
        Number(
          authorUser.earningsBalance ||
            0
        );

      const lecturerUpdated =
        await updateFirestoreFields(
          "users",
          authorUid,
          {
            earningsBalance:
              lecturerBalance +
              lecturerAmount,
            updatedAt:
              purchaseDate,
          }
        );

      if (!lecturerUpdated) {
        await updateFirestoreFields(
          "users",
          studentUid,
          {
            walletBalance:
              currentBal,
            updatedAt:
              new Date().toISOString(),
          }
        );

        return res.status(500).json({
          success: false,
          message:
            "Could not credit lecturer earnings; purchase was rolled back.",
        });
      }

      if (affiliateId) {
        const affiliateUser =
          await fetchFirestoreDocument(
            "users",
            affiliateId
          );

        const affiliateBalance =
          Number(
            affiliateUser?.commissionBalance ||
              0
          );

        const affiliateUpdated =
          await updateFirestoreFields(
            "users",
            affiliateId,
            {
              commissionBalance:
                affiliateBalance +
                affiliateAmount,
              updatedAt:
                purchaseDate,
            }
          );

        if (!affiliateUpdated) {
          await updateFirestoreFields(
            "users",
            authorUid,
            {
              earningsBalance:
                lecturerBalance,
              updatedAt:
                new Date().toISOString(),
            }
          );

          await updateFirestoreFields(
            "users",
            studentUid,
            {
              walletBalance:
                currentBal,
              updatedAt:
                new Date().toISOString(),
            }
          );

          return res.status(500).json({
            success: false,
            message:
              "Could not credit affiliate commission; purchase was rolled back.",
          });
        }
      }

      const purchaseSaved =
        await saveFirestoreDocument(
          "purchases",
          purchaseDocId,
          purchaseRecord
        );

      if (!purchaseSaved) {
        await updateFirestoreFields(
          "users",
          studentUid,
          {
            walletBalance:
              currentBal,
            updatedAt:
              new Date().toISOString(),
          }
        );

        await updateFirestoreFields(
          "users",
          authorUid,
          {
            earningsBalance:
              lecturerBalance,
            updatedAt:
              new Date().toISOString(),
          }
        );

        return res.status(500).json({
          success: false,
          message:
            "Purchase record could not be saved. Wallet changes were rolled back.",
        });
      }

      await updateFirestoreFields(
        "books",
        String(bookId),
        {
          salesCount:
            Number(
              bookDoc.salesCount ||
                0
            ) + 1,
          updatedAt:
            purchaseDate,
        }
      );

      const ledgerEntries =
        [
          {
            id: `${txRef}_platform`,
            purchaseId:
              purchaseDocId,
            role: "PLATFORM",
            uid: "PLATFORM",
            amount:
              platformAmount,
            createdAt:
              purchaseDate,
          },
          {
            id: `${txRef}_lecturer`,
            purchaseId:
              purchaseDocId,
            role: "LECTURER",
            uid: authorUid,
            amount:
              lecturerAmount,
            createdAt:
              purchaseDate,
          },
        ];

      if (affiliateId) {
        ledgerEntries.push({
          id: `${txRef}_affiliate`,
          purchaseId:
            purchaseDocId,
          role: "AFFILIATE",
          uid: affiliateId,
          amount:
            affiliateAmount,
          createdAt:
            purchaseDate,
        });
      }

      for (
        const entry of ledgerEntries
      ) {
        await saveFirestoreDocument(
          "revenueTransactions",
          entry.id,
          entry
        );
      }

      const debitTx = {
        id:
          `wal_${Date.now()}`,
        uid: studentUid,
        reference: txRef,
        flutterwaveTransactionId:
          "CAMPUSREAD_WALLET",
        amount: bookPrice,
        currency: "NGN",
        type:
          "BOOK_PURCHASE",
        status: "SUCCESS",
        paymentProvider:
          "WALLET",
        createdAt:
          purchaseDate,
        verifiedAt:
          purchaseDate,
        description:
          `Purchased: ${purchaseRecord.bookTitle}`,
      };

      await saveFirestoreDocument(
        "walletTransactions",
        debitTx.id,
        debitTx
      );

      await saveFirestoreDocument(
        "auditLogs",
        `purchase_${txRef}`,
        {
          action:
            "BOOK_PURCHASE_REVENUE_SPLIT",
          actorId:
            studentUid,
          actorRole:
            "STUDENT",
          timestamp:
            purchaseDate,
          details:
            `Book ${bookId}: ₦${bookPrice} split as Platform ₦${platformAmount}, Affiliate ₦${affiliateAmount}, Lecturer ₦${lecturerAmount}.`,
          referenceId:
            purchaseDocId,
        }
      );

      return res.json({
        success: true,
        message:
          "Textbook successfully purchased and revenue distributed.",
        walletBalance:
          balanceAfterPurchase,
        purchase:
          purchaseRecord,
        transaction:
          debitTx,
      });
    } catch (error) {
      console.error(
        "Wallet book purchase error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to process wallet purchase.",
      });
    }
  }
);

// =============================================================
// WALLET STATUS CHECK
// =============================================================

app.get(
  "/api/wallet/check-status/:reference",
  async (req, res) => {
    try {
      const authenticatedUid =
        await requireAuthenticatedUid(req);

      if (!authenticatedUid) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized. Please sign in again.",
        });
      }

      const rawRef =
        String(
          req.params.reference ||
            ""
        ).trim();

      if (!rawRef) {
        return res.status(400).json({
          success: false,
          message:
            "Missing transaction reference.",
        });
      }

      const secretKey =
        getFlutterwaveSecretKey();

      if (!secretKey) {
        return res.status(500).json({
          success: false,
          message:
            "Flutterwave secret key is not configured on the server.",
        });
      }

      // ---------------------------------------------------------
      // CHECK CACHE
      // ---------------------------------------------------------

      const cached =
        processedWalletTransactions.get(
          rawRef
        );

      if (
        cached &&
        cached.status ===
          "SUCCESS"
      ) {
        if (
          cached.uid !==
          authenticatedUid
        ) {
          return res.status(403).json({
            success: false,
            message:
              "Transaction belongs to another CampusRead account.",
          });
        }

        const userDoc =
          await fetchFirestoreDocument(
            "users",
            authenticatedUid
          );

        return res.json({
          success: true,
          status: "SUCCESS",
          message:
            "Transaction is verified and credited.",
          walletBalance:
            Number(
              userDoc?.walletBalance ||
                0
            ),
          transaction:
            cached,
        });
      }

      // ---------------------------------------------------------
      // VERIFY REFERENCE WITH FLUTTERWAVE
      // ---------------------------------------------------------

      let flwData: any;

      try {
        const flwUrl =
          `https://api.flutterwave.com/v3/transactions/` +
          `verify_by_reference?tx_ref=${encodeURIComponent(
            rawRef
          )}`;

        const flwRes =
          await fetch(flwUrl, {
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${secretKey}`,
            },
          });

        if (!flwRes.ok) {
          return res.json({
            success: false,
            status: "PENDING",
            message:
              "Flutterwave has not confirmed this transaction yet.",
          });
        }

        flwData =
          await flwRes.json();
      } catch (error) {
        console.error(
          "Flutterwave status connection error:",
          error
        );

        return res.status(502).json({
          success: false,
          status: "PENDING",
          message:
            "Unable to connect to Flutterwave while checking transaction status.",
        });
      }

      if (
        flwData?.status !==
          "success" ||
        flwData?.data?.status !==
          "successful"
      ) {
        return res.json({
          success: false,
          status: "PENDING",
          message:
            "Transaction is not yet confirmed by Flutterwave.",
        });
      }

      const currency =
        String(
          flwData.data.currency ||
            ""
        ).toUpperCase();

      if (currency !== "NGN") {
        return res.status(400).json({
          success: false,
          status: "FAILED",
          message:
            "Transaction currency mismatch. Expected NGN.",
        });
      }

      const verifiedAmount =
        Number(
          flwData.data.amount
        );

      if (
        !Number.isFinite(
          verifiedAmount
        ) ||
        verifiedAmount <= 0
      ) {
        return res.status(400).json({
          success: false,
          status: "FAILED",
          message:
            "Invalid amount returned by Flutterwave.",
        });
      }

      if (
        verifiedAmount <
        MIN_WALLET_FUNDING
      ) {
        return res.status(400).json({
          success: false,
          status: "FAILED",
          message:
            `Transaction is below the CampusRead minimum funding amount of ₦${MIN_WALLET_FUNDING.toLocaleString()}.`,
        });
      }

      // ---------------------------------------------------------
      // VERIFY METADATA OWNER
      // ---------------------------------------------------------

      const metadataUid =
        flwData.data.meta?.studentUid ||
        flwData.data.meta?.uid ||
        "";

      if (
        metadataUid &&
        String(metadataUid) !==
          authenticatedUid
      ) {
        return res.status(403).json({
          success: false,
          message:
            "This payment belongs to another CampusRead account.",
        });
      }

      // ---------------------------------------------------------
      // CANONICAL TRANSACTION ID
      // ---------------------------------------------------------

      const flwTxId =
        String(
          flwData.data.id ||
            rawRef
        );

      const flwTxRef =
        String(
          flwData.data.tx_ref ||
            rawRef
        );

      const docId =
        canonicalWalletTransactionId(
          flwTxId
        );

      // ---------------------------------------------------------
      // DUPLICATE CHECK
      // ---------------------------------------------------------

      const existing =
        await fetchFirestoreDocument(
          "walletTransactions",
          docId
        );

      if (
        existing &&
        existing.status ===
          "SUCCESS"
      ) {
        if (
          existing.uid !==
          authenticatedUid
        ) {
          return res.status(403).json({
            success: false,
            message:
              "Transaction belongs to another CampusRead account.",
          });
        }

        processedWalletTransactions.set(
          flwTxId,
          existing
        );

        processedWalletTransactions.set(
          flwTxRef,
          existing
        );

        const userDoc =
          await fetchFirestoreDocument(
            "users",
            authenticatedUid
          );

        return res.json({
          success: true,
          status: "SUCCESS",
          message:
            "Transaction is already verified and credited.",
          walletBalance:
            Number(
              userDoc?.walletBalance ||
                0
            ),
          transaction:
            existing,
        });
      }

      // ---------------------------------------------------------
      // FETCH STUDENT
      // ---------------------------------------------------------

      const userDoc =
        await fetchFirestoreDocument(
          "users",
          authenticatedUid
        );

      if (!userDoc) {
        return res.status(404).json({
          success: false,
          message:
            "Student account not found.",
        });
      }

      if (
        String(
          userDoc.role || ""
        ).toUpperCase() !==
        "STUDENT"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only students can fund this wallet.",
        });
      }

      const currentBalance =
        Number(
          userDoc.walletBalance ||
            0
        );

      const newBalance =
        currentBalance +
        verifiedAmount;

      const verifiedAt =
        new Date().toISOString();

      const txRecord = {
        id: docId,
        uid: authenticatedUid,
        reference: flwTxRef,
        flutterwaveTransactionId:
          flwTxId,
        amount:
          verifiedAmount,
        currency: "NGN",
        type:
          "WALLET_FUNDING",
        status: "SUCCESS",
        paymentProvider:
          "FLUTTERWAVE",
        createdAt:
          flwData.data.created_at ||
          verifiedAt,
        verifiedAt,
        description:
          `CampusRead Wallet Funding (₦${verifiedAmount.toLocaleString()})`,
      };

      const transactionSaved =
        await saveFirestoreDocument(
          "walletTransactions",
          docId,
          txRecord
        );

      if (!transactionSaved) {
        return res.status(500).json({
          success: false,
          status: "FAILED",
          message:
            "Payment was confirmed, but CampusRead could not record the transaction. Wallet was not credited.",
        });
      }

      const walletUpdated =
        await updateFirestoreFields(
          "users",
          authenticatedUid,
          {
            walletBalance:
              newBalance,
            updatedAt:
              verifiedAt,
          }
        );

      if (!walletUpdated) {
        return res.status(500).json({
          success: false,
          status: "FAILED",
          message:
            "Payment was recorded, but the CampusRead wallet balance could not be updated.",
          transactionReference:
            flwTxRef,
        });
      }

      processedWalletTransactions.set(
        flwTxId,
        txRecord
      );

      processedWalletTransactions.set(
        flwTxRef,
        txRecord
      );

      processedWalletTransactions.set(
        docId,
        txRecord
      );

      console.log(
        `[WALLET STATUS CREDIT] UID=${authenticatedUid} REF=${flwTxRef} AMOUNT=₦${verifiedAmount}`
      );

      return res.json({
        success: true,
        status: "SUCCESS",
        message:
          "Transaction verified successfully with Flutterwave!",
        walletBalance:
          newBalance,
        transaction:
          txRecord,
      });
    } catch (error) {
      console.error(
        "Check wallet status error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Error checking transaction status.",
      });
    }
  }
);

// =============================================================
// WALLET TRANSACTION HISTORY
// =============================================================

app.get(
  "/api/wallet/transactions/:uid",
  async (req, res) => {
    try {
      const authenticatedUid =
        await requireAuthenticatedUid(req);

      if (!authenticatedUid) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized. Please sign in again.",
        });
      }

      const uid =
        String(
          req.params.uid || ""
        );

      if (!uid) {
        return res.status(400).json({
          success: false,
          message:
            "Missing student UID.",
        });
      }

      // A student can only view their own
      // wallet transactions.
      if (
        uid !==
        authenticatedUid
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You can only access your own wallet transaction history.",
        });
      }

      const transactions =
        await queryFirestoreWalletTransactions(
          authenticatedUid
        );

      transactions.sort(
        (a, b) =>
          new Date(
            b.createdAt || 0
          ).getTime() -
          new Date(
            a.createdAt || 0
          ).getTime()
      );

      return res.json({
        success: true,
        transactions,
      });
    } catch (error) {
      console.error(
        "Fetch wallet transactions error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch wallet transactions.",
      });
    }
  }
);

// =============================================================
// PRODUCTION / DEVELOPMENT SERVER
// =============================================================

async function startServer() {
  if (
    process.env.NODE_ENV !==
    "production"
  ) {
    const vite =
      await createViteServer({
        server: {
          middlewareMode: true,
        },
        appType: "spa",
      });

    app.use(
      vite.middlewares
    );
  } else {
    const distPath =
      path.join(
        process.cwd(),
        "dist"
      );

    app.use(
      express.static(
        distPath,
        {
          index: false,
        }
      )
    );

    app.get(
      "*",
      (_req, res) => {
        res.sendFile(
          path.join(
            distPath,
            "index.html"
          )
        );
      }
    );
  }

  app.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        `Campus Read Node.js server running on port ${PORT}`
      );

      console.log(
        `Minimum wallet funding: ₦${MIN_WALLET_FUNDING.toLocaleString()}`
      );

      console.log(
        `Flutterwave secret configured: ${Boolean(
          getFlutterwaveSecretKey()
        )}`
      );
    }
  );
}

startServer();
