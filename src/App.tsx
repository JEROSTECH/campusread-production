import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MOCK_BOOKS } from './data/mockBooks';
import { Book, CartItem, ActiveTab, WebsiteSettings } from './types';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { BookCard } from './components/BookCard';
import { BookDetailModal } from './components/BookDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { ReaderModal } from './components/ReaderModal';
import { LecturerPortalModal } from './components/LecturerPortalModal';
import { HowItWorksModal } from './components/HowItWorksModal';
import { AuthModal } from './components/AuthModal';
import { AppDownloadModal } from './components/AppDownloadModal';
import { StudentDashboard } from './components/StudentDashboard';
import { LecturerDashboard } from './components/LecturerDashboard';
import { AffiliateDashboard } from './components/AffiliateDashboard';
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { Footer } from './components/Footer';
import { Filter, BookOpen } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from './lib/firebase';

export default function App() {
  const { userProfile } = useAuth();

  const [currentView, setCurrentView] = useState<string>('HOME');
  const [books, setBooks] = useState<Book[]>(MOCK_BOOKS);
  const [booksLoading, setBooksLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<ActiveTab>('all');
  const [selectedInstitution, setSelectedInstitution] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [websiteSettings, setWebsiteSettings] = useState<WebsiteSettings | undefined>(undefined);
  
  // Modals & Drawers state
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [savedBookIds, setSavedBookIds] = useState<string[]>(['book-1', 'book-3']);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [readerBook, setReaderBook] = useState<Book | null>(null);
  
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSavedOnly, setIsSavedOnly] = useState(false);
  const [isLecturerPortalOpen, setIsLecturerPortalOpen] = useState(false);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  // Auth modal state (Unified Login: No role state on login)
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authRegisterRole, setAuthRegisterRole] = useState<'STUDENT' | 'LECTURER' | 'AFFILIATE'>('STUDENT');

  const marketplaceSectionRef = useRef<HTMLDivElement>(null);

  // URL Path Router & Affiliate Ref Code Detection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode) {
      sessionStorage.setItem('campus_read_affiliate_ref', refCode);
    }

    const path = window.location.pathname.toLowerCase();
    if (path.includes('/super-admin/login')) {
      // /super-admin/login opens the SAME single unified login form
      openAuthModal('login');
    } else if (path.includes('/super-admin')) {
      setCurrentView('SUPER_ADMIN_DASHBOARD');
    } else if (path.includes('/student')) {
      setCurrentView('STUDENT_DASHBOARD');
    } else if (path.includes('/lecturer')) {
      setCurrentView('LECTURER_DASHBOARD');
    } else if (path.includes('/affiliate')) {
      setCurrentView('AFFILIATE_DASHBOARD');
    } else if (path.includes('/login')) {
      openAuthModal('login');
    } else if (path.includes('/register')) {
      openAuthModal('register');
    } else if (path.includes('/bookstore')) {
      setCurrentView('BOOKSTORE');
    } else if (path.includes('/past-questions')) {
      setCurrentView('PAST_QUESTIONS');
    } else if (path.includes('/download')) {
      setIsDownloadModalOpen(true);
    }

    const handlePopState = () => {
      const p = window.location.pathname.toLowerCase();
      if (p.includes('/student')) setCurrentView('STUDENT_DASHBOARD');
      else if (p.includes('/lecturer')) setCurrentView('LECTURER_DASHBOARD');
      else if (p.includes('/affiliate')) setCurrentView('AFFILIATE_DASHBOARD');
      else if (p.includes('/super-admin')) setCurrentView('SUPER_ADMIN_DASHBOARD');
      else setCurrentView('HOME');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
useEffect(() => {
  const approvedBooksQuery = query(
    collection(db, 'books'),
    where('approvalStatus', '==', 'APPROVED')
  );

  const unsubscribe = onSnapshot(
    approvedBooksQuery,
    (snapshot) => {
      const approvedFirestoreBooks: Book[] = snapshot.docs.map((bookDoc) => ({
        ...bookDoc.data(),
        id: bookDoc.id,
      } as Book));

      // Prevent duplicate books when a Firestore book has
      // the same ID as one of the demo/mock books.
      const firestoreIds = new Set(
        approvedFirestoreBooks.map((book) => book.id)
      );

      const remainingMockBooks = MOCK_BOOKS.filter(
        (mockBook) => !firestoreIds.has(mockBook.id)
      );

      // Approved Firestore books appear first.
      // Existing mock books remain available as demo content.
      setBooks([
        ...approvedFirestoreBooks,
        ...remainingMockBooks,
      ]);

      setBooksLoading(false);
    },
    (error) => {
      console.error('Student catalogue Firestore error:', error);

      // Keep the existing catalogue available if Firestore
      // temporarily fails.
      setBooks(MOCK_BOOKS);
      setBooksLoading(false);
    }
  );

  return () => unsubscribe();
}, []);
  // Fetch dynamic website settings from Firestore
  useEffect(() => {
    async function loadSettings() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'websiteSettings'));
        if (snap.exists()) {
          setWebsiteSettings(snap.data() as WebsiteSettings);
        }
      } catch (err) {
        console.warn('Could not load website settings:', err);
      }
    }
    loadSettings();
  }, []);

  // Cart operations
  const handleAddToCart = (book: Book) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.book.id === book.id);
      if (existing) {
        return prev.map((item) =>
          item.book.id === book.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { book, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const handleUpdateQuantity = (bookId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(bookId);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) =>
        item.book.id === bookId ? { ...item, quantity } : item
      )
    );
  };

  const handleRemoveFromCart = (bookId: string) => {
    setCartItems((prev) => prev.filter((item) => item.book.id !== bookId));
  };

  const handleToggleSave = (book: Book) => {
    setSavedBookIds((prev) =>
      prev.includes(book.id)
        ? prev.filter((id) => id !== book.id)
        : [...prev, book.id]
    );
  };

  const handleAddCustomBook = (newBook: Book) => {
    setBooks((prev) => [newBook, ...prev]);
  };

  const scrollToMarketplace = () => {
    marketplaceSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const resetFilters = () => {
    setSelectedTab('all');
    setSelectedInstitution('all');
    setSearchQuery('');
    setIsSavedOnly(false);
  };

  const openAuthModal = (mode: 'login' | 'register', registerRole?: 'STUDENT' | 'LECTURER' | 'AFFILIATE') => {
    setAuthMode(mode);
    if (registerRole) {
      setAuthRegisterRole(registerRole);
    }
    setIsAuthOpen(true);
  };

  const handleAuthRedirect = (role: string) => {
    if (role === 'STUDENT') setCurrentView('STUDENT_DASHBOARD');
    else if (role === 'LECTURER') setCurrentView('LECTURER_DASHBOARD');
    else if (role === 'AFFILIATE') setCurrentView('AFFILIATE_DASHBOARD');
    else if (role === 'SUPER_ADMIN' || role === 'ADMIN') setCurrentView('SUPER_ADMIN_DASHBOARD');
    else setCurrentView('HOME');
  };

  // Filtered books
  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      // Past Question view check
      if (currentView === 'PAST_QUESTIONS' && !book.isPastQuestion && book.format !== 'Past Question') {
        return false;
      }

      // Saved only mode
      if (isSavedOnly && !savedBookIds.includes(book.id)) {
        return false;
      }

      // Department/Faculty Tab Filter
      if (selectedTab !== 'all') {
        if (book.department !== selectedTab && book.faculty !== selectedTab) {
          return false;
        }
      }

      // Institution Filter
      if (selectedInstitution !== 'all') {
        const instLower = selectedInstitution.toLowerCase();
        const matchesInstitution =
          book.institution.toLowerCase().includes(instLower) ||
          (instLower === 'unilag' && book.institution.includes('Lagos')) ||
          (instLower === 'ui' && book.institution.includes('Ibadan')) ||
          (instLower === 'oau' && book.institution.includes('Awolowo')) ||
          (instLower === 'covenant' && book.institution.includes('Covenant')) ||
          (instLower === 'unn' && book.institution.includes('Nsukka'));

        if (!matchesInstitution) return false;
      }

      // Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = book.title.toLowerCase().includes(q);
        const matchAuthor = book.author.toLowerCase().includes(q);
        const matchDept = book.department.toLowerCase().includes(q);
        const matchInst = book.institution.toLowerCase().includes(q);
        const matchIsbn = book.isbn.toLowerCase().includes(q);

        if (!matchTitle && !matchAuthor && !matchDept && !matchInst && !matchIsbn) {
          return false;
        }
      }

      return true;
    });
  }, [books, selectedTab, selectedInstitution, searchQuery, isSavedOnly, savedBookIds, currentView]);

  const categories: { id: ActiveTab; label: string }[] = [
    { id: 'all', label: 'All Collections' },
    { id: 'Engineering', label: 'Engineering' },
    { id: 'Medical Sciences', label: 'Medical Sciences' },
    { id: 'Faculty of Law', label: 'Faculty of Law' },
    { id: 'Social Sciences', label: 'Social Sciences' },
    { id: 'Biological Sciences', label: 'Biological Sciences' },
    { id: 'Business & Tech', label: 'Business & Tech' },
  ];

  return (
    <div className="flex flex-col min-h-screen w-full bg-[#f8fafc] font-sans overflow-x-hidden">
      {/* Header Bar */}
      <Header
        currentView={currentView}
        setCurrentView={setCurrentView}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedInstitution={selectedInstitution}
        setSelectedInstitution={setSelectedInstitution}
        cartCount={cartItems.reduce((acc, item) => acc + item.quantity, 0)}
        savedCount={savedBookIds.length}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenAuth={(mode, regRole) => openAuthModal(mode, regRole)}
        onOpenDownloadModal={() => setIsDownloadModalOpen(true)}
      />

      {/* Main Content Areas */}
      <main className="flex-1 w-full">
        {currentView === 'STUDENT_DASHBOARD' ? (
          <StudentDashboard
            onOpenBook={(b) => setSelectedBook(b)}
            onOpenReader={(b) => setReaderBook(b)}
            onNavigateToBookstore={() => setCurrentView('BOOKSTORE')}
          />
        ) : currentView === 'LECTURER_DASHBOARD' ? (
          <LecturerDashboard />
        ) : currentView === 'AFFILIATE_DASHBOARD' ? (
          <AffiliateDashboard />
        ) : currentView === 'SUPER_ADMIN_DASHBOARD' ? (
          <SuperAdminDashboard />
        ) : (
          <>
            {/* Hero Section */}
            <HeroSection
              settings={websiteSettings}
              onExploreBooks={scrollToMarketplace}
              onCreateStudentAccount={() => openAuthModal('register', 'STUDENT')}
              onBecomeAuthor={() => openAuthModal('register', 'LECTURER')}
            />

            {/* Marketplace Explorer */}
            <section
              id="marketplace"
              ref={marketplaceSectionRef}
              className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6"
            >
              {/* Category Navigation Pills */}
              <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-200 pb-4">
                <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full no-scrollbar">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setSelectedTab(cat.id);
                        if (currentView === 'CATEGORIES') setCurrentView('HOME');
                      }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                        selectedTab === cat.id
                          ? 'bg-blue-900 text-white shadow-sm'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
                  <span className="flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5" />
                    <span>{filteredBooks.length} materials found</span>
                  </span>
                </div>
              </div>

              {/* Book Grid */}
              {booksLoading ? (
  <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
    <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-900 rounded-full animate-spin mx-auto mb-4" />
    <p className="text-sm font-semibold text-slate-600">
      Loading approved academic materials...
    </p>
  </div>
) : filteredBooks.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-slate-800 text-base">No academic materials match your criteria</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Try clearing search parameters or switching faculties to discover available textbooks.
                  </p>
                  <button
                    onClick={resetFilters}
                    className="px-4 py-2 bg-slate-900 text-white rounded-md text-xs font-bold hover:bg-slate-800 cursor-pointer"
                  >
                    Reset Search
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {filteredBooks.map((book) => (
                    <BookCard
                      key={book.id}
                      book={book}
                      isSaved={savedBookIds.includes(book.id)}
                      onSelectBook={(selected) => setSelectedBook(selected)}
                      onAddToCart={(cartBook) => handleAddToCart(cartBook)}
                      onToggleSave={(savedBook) => handleToggleSave(savedBook)}
                      onPreviewExcerpt={(readerTarget) => setReaderBook(readerTarget)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Institutional Footer */}
      <Footer
        settings={websiteSettings}
        onOpenLecturerPortal={() => openAuthModal('register', 'LECTURER')}
        onOpenHowItWorks={() => setIsHowItWorksOpen(true)}
      />

      {/* Single Unified Auth Modal Overlay */}
      <AuthModal
        isOpen={isAuthOpen}
        initialMode={authMode}
        initialRegisterRole={authRegisterRole}
        onClose={() => setIsAuthOpen(false)}
        onSuccessRedirect={handleAuthRedirect}
      />

      {/* App Download Modal Overlay */}
      <AppDownloadModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
      />

      {/* Modal Overlays */}
      {selectedBook && (
        <BookDetailModal
          book={selectedBook}
          isSaved={savedBookIds.includes(selectedBook.id)}
          onClose={() => setSelectedBook(null)}
          onAddToCart={(b) => {
            handleAddToCart(b);
            setSelectedBook(null);
          }}
          onToggleSave={handleToggleSave}
          onOpenReader={(b) => {
            setSelectedBook(null);
            setReaderBook(b);
          }}
        />
      )}

      <CartDrawer
        isOpen={isCartOpen}
        cartItems={cartItems}
        onClose={() => setIsCartOpen(false)}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveFromCart}
        onClearCart={() => setCartItems([])}
      />

      {readerBook && (
        <ReaderModal
          book={readerBook}
          onClose={() => setReaderBook(null)}
        />
      )}

      {isLecturerPortalOpen && (
        <LecturerPortalModal
          onClose={() => setIsLecturerPortalOpen(false)}
          onAddCustomBook={handleAddCustomBook}
        />
      )}

      {isHowItWorksOpen && (
        <HowItWorksModal
          settings={websiteSettings}
          onClose={() => setIsHowItWorksOpen(false)}
          onBrowse={scrollToMarketplace}
        />
      )}
    </div>
  );
}
