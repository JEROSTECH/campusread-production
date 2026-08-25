export type UserRole = 'STUDENT' | 'LECTURER' | 'AFFILIATE' | 'ADMIN' | 'SUPER_ADMIN';

export type UserAccountType = 'STUDENT' | 'LECTURER' | 'AFFILIATE' | 'ADMIN' | 'SUPER_ADMIN';

export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface BaseUserProfile {
  uid: string;
  fullName: string;
  email: string;
  role: UserRole;
  accountType: UserAccountType;
  status: UserStatus;
  phone?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface StudentProfile extends BaseUserProfile {
  role: 'STUDENT';
  matricNumber: string;
  institution: string;
  faculty: string;
  department: string;
  level: string;
  walletBalance: number;
}

export interface LecturerProfile extends BaseUserProfile {
  role: 'LECTURER';
  title: string;
  institution: string;
  faculty: string;
  department: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  earningsBalance: number;
}

export interface AffiliateProfile extends BaseUserProfile {
  role: 'AFFILIATE';
  affiliateCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  commissionBalance: number;
  totalReferralClicks?: number;
}

export interface SuperAdminProfile extends BaseUserProfile {
  role: 'SUPER_ADMIN' | 'ADMIN';
  isPrimaryAdmin?: boolean;
}

export type UserProfile = StudentProfile | LecturerProfile | AffiliateProfile | SuperAdminProfile;

export interface Book {
  id: string;
  title: string;
  subtitle?: string;
  author: string;
  authorUid?: string;
  authorTitle?: string;
  department: string;
  faculty: string;
  institution: string;
  courseCode?: string;
  level?: string;
  price: number;
  rating: number;
  reviewCount: number;
  coverGradient?: string;
  coverUrl?: string;
  contentUrl?: string;
  fileStoragePath?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  uploadStatus?: 'UPLOADING' | 'UPLOADED' | 'FAILED' | 'NONE';
  uploadedBy?: string;
  uploadedAt?: string;
  contentVersion?: number;
  hasPdf?: boolean;
  format: 'eBook' | 'Course Pack' | 'Past Question' | 'Lecture Notes' | 'Journal';
  edition?: string;
  publishedYear: number;
  pages: number;
  isbn: string;
  description: string;
  tableOfContents?: string[];
  sampleExcerpt?: string;
  isFeatured?: boolean;
  isBestseller?: boolean;
  isPastQuestion?: boolean;
  approvalStatus: ApprovalStatus;
  rejectionReason?: string;
  salesCount: number;
  createdAt: string;
}

export interface CartItem {
  book: Book;
  quantity: number;
}

export interface Order {
  id: string;
  studentUid: string;
  studentName: string;
  studentEmail: string;
  bookId: string;
  bookTitle: string;
  authorUid?: string;
  affiliateCode?: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'FAILED';
  transactionRef: string;
  createdAt: string;
}

export interface Purchase {
  id: string;
  studentUid: string;
  bookId: string;
  bookTitle: string;
  authorUid?: string;
  affiliateId?: string;
  price: number;
  platformAmount?: number;
  affiliateAmount?: number;
  lecturerAmount?: number;
  commissionSnapshot?: {
    platformPercentage: number;
    affiliatePercentage: number;
    lecturerPercentage: number;
  };
  transactionRef: string;
  purchaseDate: string;
  book?: Book;
}

export interface WalletTransaction {
  id: string;
  uid: string;
  reference: string;
  flutterwaveTransactionId: string;
  amount: number;
  currency: 'NGN' | 'USD';
  type: 'WALLET_FUNDING' | 'BOOK_PURCHASE' | 'ADJUSTMENT' | 'WITHDRAWAL';
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  paymentProvider: 'FLUTTERWAVE' | 'WALLET' | 'SYSTEM';
  createdAt: string;
  verifiedAt?: string;
  description: string;
}

export interface CommissionSettings {
  platformPercentage: number;
  affiliatePercentage: number;
  lecturerPercentage: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  actorId: string;
  actorRole: string;
  timestamp: string;
  details?: string;
  affectedResource?: string;
  previousValue?: string;
  newValue?: string;
  referenceId?: string;
}

export interface AppDistribution {
  androidApkUrl: string;
  apkVersion: string;
  apkBuildNumber: string;
  apkReleaseNotes: string;
  apkStatus: 'ACTIVE' | 'INACTIVE';
  apkUploadDate?: string;
  appStoreUrl: string;
  testFlightUrl: string;
  iosVersion: string;
  iosBuildNumber: string;
  iosReleaseNotes: string;
  iosStatus: 'ACTIVE' | 'INACTIVE';
  updatedAt: string;
}

export interface Institution {
  id: string;
  name: string;
  shortName: string;
  state: string;
  status: 'ACTIVE' | 'DISABLED';
  faculties?: string[];
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export interface WebsiteSettings {
  heroBadge?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroCtaText?: string;
  secondaryCtaText?: string;
  authorCtaText?: string;
  contactEmail?: string;
  contactPhone?: string;
  announcement?: string;
  faqs?: FAQItem[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface ReadingProgress {
  id: string;
  studentUid: string;
  bookId: string;
  lastPage: number;
  totalPages: number;
  percentage: number;
  lastReadAt: string;
  bookmarks?: number[];
  notes?: { page: number; text: string; createdAt: string }[];
}

export interface WithdrawalRequest {
  id: string;
  userUid: string;
  userName: string;
  userRole: UserRole;
  bankName: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  processedAt?: string;
}

export interface AppSettings {
  androidApkUrl: string;
  playStoreUrl: string;
  appStoreUrl: string;
  testFlightUrl: string;
  showAppBanner: boolean;
  updatedAt: string;
}

export type ActiveTab = string;
