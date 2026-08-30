import React, { useState } from 'react';
import { Search, ShoppingBag, BookOpen, User, Building2, Sparkles, Menu, X, LogOut, Smartphone } from 'lucide-react';
import { INSTITUTIONS } from '../data/mockBooks';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedInstitution: string;
  setSelectedInstitution: (institutionId: string) => void;
  cartCount: number;
  savedCount: number;
  onOpenCart: () => void;
  onOpenAuth: (mode: 'login' | 'register', registerRole?: 'STUDENT' | 'LECTURER' | 'AFFILIATE') => void;
  onOpenDownloadModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  setCurrentView,
  searchQuery,
  setSearchQuery,
  selectedInstitution,
  setSelectedInstitution,
  cartCount,
  onOpenCart,
  onOpenAuth,
  onOpenDownloadModal,
}) => {
  const { userProfile, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNav = (view: string) => {
    setCurrentView(view);
    setMobileMenuOpen(false);
  };

  return (
    <header id="main-header" className="flex items-center justify-between px-4 lg:px-8 py-3 bg-white border-b border-slate-200 shadow-sm shrink-0 sticky top-0 z-40">
      {/* Brand & Main Desktop Nav */}
      <div className="flex items-center gap-6 xl:gap-8">
        <button
          id="brand-logo-button"
          onClick={() => handleNav('HOME')}
          className="text-xl lg:text-2xl font-extrabold tracking-tighter text-slate-900 flex items-center gap-2 hover:opacity-90 transition-opacity text-left cursor-pointer"
        >
          <div className="w-8 h-8 lg:w-9 lg:h-9 bg-blue-900 rounded-lg flex items-center justify-center text-white text-xs lg:text-sm font-black shadow-md">
            CR
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold tracking-tight text-blue-950 leading-none">CAMPUS READ</span>
            <span className="text-[9px] font-bold tracking-wider text-amber-600 uppercase">Read. Learn. Pass.</span>
          </div>
        </button>

        {/* Public Desktop Navigation Links */}
        <nav id="header-navigation" className="hidden xl:flex items-center gap-4 xl:gap-5 text-xs xl:text-sm font-semibold text-slate-700">
          <button
            onClick={() => handleNav('HOME')}
            className={`hover:text-blue-800 transition-colors cursor-pointer ${currentView === 'HOME' ? 'text-blue-900 font-bold border-b-2 border-blue-900 pb-0.5' : ''}`}
          >
            Home
          </button>
          <button
            onClick={() => handleNav('BOOKSTORE')}
            className={`hover:text-blue-800 transition-colors cursor-pointer ${currentView === 'BOOKSTORE' ? 'text-blue-900 font-bold border-b-2 border-blue-900 pb-0.5' : ''}`}
          >
            Bookstore
          </button>
          <button
            onClick={() => handleNav('PAST_QUESTIONS')}
            className={`hover:text-blue-800 transition-colors cursor-pointer ${currentView === 'PAST_QUESTIONS' ? 'text-blue-900 font-bold border-b-2 border-blue-900 pb-0.5' : ''}`}
          >
            Past Questions
          </button>
          <button
            onClick={() => handleNav('CATEGORIES')}
            className={`hover:text-blue-800 transition-colors cursor-pointer ${currentView === 'CATEGORIES' ? 'text-blue-900 font-bold border-b-2 border-blue-900 pb-0.5' : ''}`}
          >
            Categories
          </button>

          <button
            onClick={() => onOpenAuth('register', 'LECTURER')}
            className="hover:text-blue-800 transition-colors text-amber-700 font-bold flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Become an Author
          </button>

          <button
            onClick={() => onOpenAuth('register', 'AFFILIATE')}
            className="hover:text-blue-800 transition-colors text-emerald-700 font-bold cursor-pointer"
          >
            Become an Affiliate
          </button>
        </nav>
      </div>

      {/* Middle/Right Controls */}
      <div className="flex items-center gap-2 lg:gap-3">
        {/* Search Input */}
        <div id="search-bar-container" className="relative hidden md:block">
          <span className="absolute inset-y-0 left-2.5 flex items-center text-slate-400 pointer-events-none">
            <Search className="w-3.5 h-3.5" />
          </span>
          <input
            id="search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (currentView !== 'BOOKSTORE') setCurrentView('BOOKSTORE');
            }}
            placeholder="Search textbooks, GST..."
            className="pl-8 pr-3 py-1.5 bg-slate-100 border border-slate-200 rounded-md text-xs w-36 lg:w-44 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
          />
        </div>

        {/* Institution Filter */}
        <div id="institution-selector-container" className="hidden 2xl:flex items-center bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700">
          <Building2 className="w-3.5 h-3.5 text-blue-800 mr-1 shrink-0" />
          <select
            id="institution-select"
            value={selectedInstitution}
            onChange={(e) => setSelectedInstitution(e.target.value)}
            className="bg-transparent border-none outline-none font-medium text-slate-800 cursor-pointer text-xs"
          >
            {INSTITUTIONS.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>
        </div>

        {/* Download Mobile App Button */}
        <button
          onClick={onOpenDownloadModal}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md font-bold text-xs transition-colors cursor-pointer"
          title="Download Campus Read Mobile App"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
          <span>Get App</span>
        </button>

        {/* Cart Drawer Toggle Button */}
        <button
          id="cart-drawer-button"
          onClick={onOpenCart}
          className="relative flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md font-semibold text-xs transition-colors cursor-pointer"
        >
          <ShoppingBag className="w-4 h-4 text-blue-900" />
          <span className="hidden sm:inline">Cart</span>
          {cartCount > 0 && (
            <span id="cart-badge" className="bg-blue-800 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              {cartCount}
            </span>
          )}
        </button>

        {/* Auth State Controls or User Dashboard Link */}
        {userProfile ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (userProfile.role === 'STUDENT') handleNav('STUDENT_DASHBOARD');
                else if (userProfile.role === 'LECTURER') handleNav('LECTURER_DASHBOARD');
                else if (userProfile.role === 'AFFILIATE') handleNav('AFFILIATE_DASHBOARD');
                else handleNav('SUPER_ADMIN_DASHBOARD');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-md font-bold text-xs hover:bg-blue-100 transition-colors cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
              <span className="max-w-[100px] truncate">{(userProfile.fullName || 'User').split(' ')[0]}</span>
              <span className="bg-blue-900 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase">
                {userProfile.role}
              </span>
            </button>
            <button
              onClick={logout}
              className="p-1.5 text-slate-500 hover:text-red-600 rounded hover:bg-slate-100 cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenAuth('login')}
              className="text-xs font-bold text-slate-800 hover:text-blue-900 px-3 py-1.5 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
            >
              LOGIN
            </button>
            <button
              onClick={() => onOpenAuth('register', 'STUDENT')}
              className="text-xs font-extrabold bg-blue-900 hover:bg-blue-950 text-white px-3.5 py-1.5 rounded-md shadow-sm transition-all cursor-pointer"
            >
              REGISTER
            </button>
          </div>
        )}

        {/* Mobile Menu Toggle Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-slate-700 xl:hidden cursor-pointer"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="absolute top-full left-0 w-full bg-white border-b border-slate-200 shadow-xl p-4 xl:hidden flex flex-col gap-3 text-sm font-semibold text-slate-800 z-50">
          <button onClick={() => handleNav('HOME')} className="text-left py-1 hover:text-blue-800">Home</button>
          <button onClick={() => handleNav('BOOKSTORE')} className="text-left py-1 hover:text-blue-800">Bookstore</button>
          <button onClick={() => handleNav('PAST_QUESTIONS')} className="text-left py-1 hover:text-blue-800">Past Questions</button>
          <button onClick={() => handleNav('CATEGORIES')} className="text-left py-1 hover:text-blue-800">Categories</button>
          <button onClick={onOpenDownloadModal} className="text-left py-1 text-emerald-700 font-bold flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            Download Mobile App
          </button>
          <hr className="border-slate-200" />
          {!userProfile && (
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => { onOpenAuth('login'); setMobileMenuOpen(false); }}
                className="w-full text-center py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold rounded-lg border border-slate-200 text-xs"
              >
                LOGIN
              </button>
              <button
                onClick={() => { onOpenAuth('register', 'STUDENT'); setMobileMenuOpen(false); }}
                className="w-full text-center py-2.5 bg-blue-900 hover:bg-blue-950 text-white font-extrabold rounded-lg shadow-sm text-xs"
              >
                REGISTER ACCOUNT
              </button>
            </div>
          )}
          <hr className="border-slate-200 my-1" />
          <button onClick={() => { onOpenAuth('register', 'STUDENT'); setMobileMenuOpen(false); }} className="text-left py-1 text-blue-900 font-bold text-xs">Student Registration</button>
          <button onClick={() => { onOpenAuth('register', 'LECTURER'); setMobileMenuOpen(false); }} className="text-left py-1 text-amber-700 font-bold text-xs">Become an Author</button>
          <button onClick={() => { onOpenAuth('register', 'AFFILIATE'); setMobileMenuOpen(false); }} className="text-left py-1 text-emerald-700 font-bold text-xs">Become an Affiliate</button>
        </div>
      )}
    </header>
  );
};
