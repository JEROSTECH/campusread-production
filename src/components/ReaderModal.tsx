import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Bookmark, Moon, Sun, Type, ZoomIn, ZoomOut, Maximize2, Minimize2, List, Shield, Download, Lock, EyeOff, FileText, AlertCircle, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { Book } from '../types';
import { useAuth } from '../context/AuthContext';
import { getPdfDataForReader, generateSampleCoursePackPdf } from '../lib/pdfStorage';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Configure PDF.js worker
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

interface ReaderModalProps {
  book: Book;
  purchaseRef?: string;
  onClose: () => void;
}

export const ReaderModal: React.FC<ReaderModalProps> = ({ book, purchaseRef = 'CR-REF-891024', onClose }) => {
  const { userProfile } = useAuth();

  // Document state
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(book.pages || 1);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Theme & Canvas states
  const [themeMode, setThemeMode] = useState<'light' | 'sepia' | 'dark'>('light');
  const [zoomLevel, setZoomLevel] = useState(120); // 120% default scale
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isTabHidden, setIsTabHidden] = useState(false);
  
  // Bookmarks
  const [bookmarkedPages, setBookmarkedPages] = useState<number[]>([1]);

  // Moving Watermark coordinates state
  const [watermarkPos, setWatermarkPos] = useState({ top: 25, left: 20 });

  const readerContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  // Load PDF Binary and Initialize PDF.js document
  useEffect(() => {
    let isCancelled = false;

    async function loadPdfDocument() {
      setLoading(true);
      setLoadingError(null);

      // Verify Material Approval Status
      const isSuperAdminOrAdmin = userProfile?.role === 'SUPER_ADMIN' || userProfile?.role === 'ADMIN';
      const isAuthor = userProfile?.uid && book.authorUid && userProfile.uid === book.authorUid;

      if (!isSuperAdminOrAdmin && !isAuthor && book.approvalStatus && book.approvalStatus !== 'APPROVED') {
        setLoadingError('Access Denied: This academic material is currently in PENDING or REJECTED status and has not been approved for student access.');
        setLoading(false);
        return;
      }

      try {
        let pdfBuffer = await getPdfDataForReader(book, {
          uid: userProfile?.uid,
          role: userProfile?.role,
          matric: (userProfile as any)?.matricNumber,
          purchaseRef
        });

        // If no binary was stored on server, generate verified course pack PDF on the fly
        if (!pdfBuffer) {
          pdfBuffer = generateSampleCoursePackPdf(book);
        }

        if (isCancelled) return;

        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(pdfBuffer),
          cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/cmaps/`,
          cMapPacked: true,
        });

        const loadedDoc = await loadingTask.promise;
        if (isCancelled) return;

        setPdfDoc(loadedDoc);
        setTotalPages(loadedDoc.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch (err: any) {
        console.error('Failed to load PDF document into viewer:', err);
        if (!isCancelled) {
          setLoadingError('Unable to render PDF document. Please check network connection or permissions.');
          setLoading(false);
        }
      }
    }

    loadPdfDocument();

    return () => {
      isCancelled = true;
    };
  }, [book]);

  // Render active page onto Canvas
  const renderPage = useCallback(async (pageNum: number, pdf: any) => {
    if (!pdf || !canvasRef.current) return;

    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdf.getPage(pageNum);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      const pixelRatio = window.devicePixelRatio || 1;
      const baseScale = (zoomLevel / 100) * 1.3;
      const viewport = page.getViewport({ scale: baseScale });

      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      // Apply theme filter if sepia or dark
      if (themeMode === 'sepia') {
        context.fillStyle = '#fbf0d9';
      } else if (themeMode === 'dark') {
        context.fillStyle = '#1e2022';
      } else {
        context.fillStyle = '#ffffff';
      }
      context.fillRect(0, 0, viewport.width, viewport.height);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      const task = page.render(renderContext);
      renderTaskRef.current = task;
      await task.promise;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Page rendering error:', err);
      }
    }
  }, [zoomLevel, themeMode]);

  // Trigger render when page, zoom, or doc changes
  useEffect(() => {
    if (pdfDoc && !loading) {
      renderPage(currentPage, pdfDoc);
    }
  }, [pdfDoc, currentPage, zoomLevel, themeMode, loading, renderPage]);

  // Save Reading Progress to Firestore
  useEffect(() => {
    if (userProfile?.uid && book.id && currentPage) {
      const progressId = `${userProfile.uid}_${book.id}`;
      setDoc(doc(db, 'readingProgress', progressId), {
        userId: userProfile.uid,
        bookId: book.id,
        bookTitle: book.title,
        currentPage,
        totalPages,
        progressPercent: Math.round((currentPage / totalPages) * 100),
        lastReadAt: new Date().toISOString(),
      }, { merge: true }).catch((err) => console.warn('Progress save:', err));
    }
  }, [userProfile?.uid, book.id, currentPage, totalPages]);

  // Animate watermark across screen periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const top = Math.floor(Math.random() * 65) + 15;
      const left = Math.floor(Math.random() * 55) + 15;
      setWatermarkPos({ top, left });
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // Handle Tab Visibility Changes (Pause & Obscure reader when tab is inactive)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsTabHidden(true);
      } else {
        setIsTabHidden(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Keyboard shortcut protection (Block Print, Save, Inspect, Copy)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Block Ctrl+P / Cmd+P
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
      }
      // Block Ctrl+S / Cmd+S
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
      }
      // Block Ctrl+U / Cmd+U
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
        e.preventDefault();
      }
      // Block F12
      if (e.key === 'F12') {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(p => p + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(p => p - 1);
  };

  const toggleBookmark = () => {
    setBookmarkedPages(prev =>
      prev.includes(currentPage) ? prev.filter(p => p !== currentPage) : [...prev, currentPage]
    );
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      readerContainerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };
// Mobile/tablet pinch-to-zoom support
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(zoomLevel);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;

      pinchStartDistanceRef.current = Math.hypot(dx, dy);
      pinchStartZoomRef.current = zoomLevel;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2 || pinchStartDistanceRef.current === null) {
      return;
    }

    e.preventDefault();

    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const distance = Math.hypot(dx, dy);

    const scale = distance / pinchStartDistanceRef.current;
    const nextZoom = Math.round(
      Math.min(300, Math.max(60, pinchStartZoomRef.current * scale))
    );

    setZoomLevel(nextZoom);
  };

  const handleTouchEnd = () => {
    pinchStartDistanceRef.current = null;
  };

  // Dynamic watermark text string (Student Name • Matriculation Number • Email • Timestamp • DRM Reference)
  const studentName = userProfile?.fullName || 'Verified Reader';
  const studentEmail = userProfile?.email || 'student@campusread.com.ng';
  const matricNumber = (userProfile as any)?.matricNumber || 'CAMPUS-VERIFIED';
  const timestamp = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const watermarkText = `${studentName} • ${matricNumber} • ${studentEmail} • ${timestamp} • DRM REF: ${purchaseRef}`;
  // Theme container styling
  const themeStyles = {
    light: 'bg-slate-100 text-slate-900',
    sepia: 'bg-[#f4ebd0] text-[#5b4636]',
    dark: 'bg-[#121314] text-[#e8e6e3]'
  };

  return (
    <div
      ref={readerContainerRef}
      className={`fixed inset-0 z-50 flex flex-col ${themeStyles[themeMode]} select-none`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Privacy / Hidden Tab Shield Overlay */}
      {isTabHidden && (
        <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white space-y-3">
          <EyeOff className="w-12 h-12 text-amber-400 animate-bounce" />
          <h3 className="text-xl font-bold font-serif">Protected Reading Session Paused</h3>
          <p className="text-xs text-slate-300 max-w-md">
            The protected PDF reader has paused rendering because the browser tab or window is currently inactive.
          </p>
          <span className="text-[11px] bg-blue-900 px-3 py-1 rounded-full text-blue-200 font-bold">
            Return to this window to resume reading
          </span>
        </div>
      )}

      {/* Top Controls Bar */}
      <div className={`flex items-center justify-between px-4 lg:px-8 py-2.5 border-b shrink-0 ${themeMode === 'dark' ? 'bg-[#18191a] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'} shadow-sm`}>
        {/* Left: Book Title & Protection Badge */}
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors" title="Close Reader">
            <X className="w-5 h-5" />
          </button>
          <div>
            <h3 className="font-bold text-xs lg:text-sm max-w-xs lg:max-w-md truncate">{book.title}</h3>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-semibold">
              <span className="flex items-center gap-1 text-emerald-600 font-bold">
                <Shield className="w-3 h-3" />
                Verified DRM Protected Canvas
              </span>
              <span>• Page {currentPage} of {totalPages}</span>
            </div>
          </div>
        </div>

        {/* Center: TOC & Page Jump */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={() => setIsTocOpen(!isTocOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            <List className="w-3.5 h-3.5" />
            <span>Table of Contents</span>
          </button>

          <div className="flex items-center gap-1 text-xs">
            <button onClick={handlePrevPage} disabled={currentPage <= 1} className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (val >= 1 && val <= totalPages) setCurrentPage(val);
              }}
              className="w-12 text-center py-1 rounded border border-slate-300 text-xs font-bold bg-transparent"
            />
            <span className="text-slate-400 font-bold">/ {totalPages}</span>
            <button onClick={handleNextPage} disabled={currentPage >= totalPages} className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: Theme, Zoom & Fullscreen */}
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setZoomLevel(z => Math.max(z - 15, 60))}
              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 font-mono font-bold text-[11px] text-slate-700 dark:text-slate-200">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel(z => Math.min(z + 15, 300))}
              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Theme Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
            <button
              onClick={() => setThemeMode('light')}
              className={`px-2 py-1 rounded font-bold ${themeMode === 'light' ? 'bg-white shadow text-slate-900' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Light
            </button>
            <button
              onClick={() => setThemeMode('sepia')}
              className={`px-2 py-1 rounded font-bold ${themeMode === 'sepia' ? 'bg-[#f5e6cc] text-[#5b4636]' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Sepia
            </button>
            <button
              onClick={() => setThemeMode('dark')}
              className={`px-2 py-1 rounded font-bold ${themeMode === 'dark' ? 'bg-slate-900 text-white' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Dark
            </button>
          </div>

          {/* Bookmark */}
          <button
            onClick={toggleBookmark}
            className={`p-1.5 rounded hover:bg-slate-200/50 ${bookmarkedPages.includes(currentPage) ? 'text-amber-500 font-bold' : 'text-slate-500'}`}
            title="Bookmark Page"
          >
            <Bookmark className="w-4 h-4 fill-current" />
          </button>

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} className="p-1.5 rounded hover:bg-slate-200/50 text-slate-600 dark:text-slate-300">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Page Area with Dynamic Moving DRM Watermark */}
      <div className="flex-1 relative overflow-hidden flex">
        {/* Table of Contents Sidebar */}
        {isTocOpen && (
          <div className={`w-64 border-r p-4 overflow-y-auto shrink-0 ${themeMode === 'dark' ? 'bg-[#141516] border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`}>
            <h4 className="font-bold text-xs uppercase tracking-wider mb-3">Table of Contents</h4>
            <div className="space-y-1.5 text-xs">
              {Array.from({ length: Math.min(totalPages, 12) }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCurrentPage(idx + 1);
                    setIsTocOpen(false);
                  }}
                  className={`block text-left truncate w-full px-2.5 py-1.5 rounded-lg transition-colors font-medium ${
                    currentPage === idx + 1 ? 'bg-blue-800 text-white font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Page {idx + 1}: Section {idx + 1}.0
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dynamic Watermark Overlay (Floating Diagonally across the viewport) */}
        <div
          className="absolute z-30 pointer-events-none opacity-30 font-mono text-[11px] font-black text-red-600 uppercase tracking-widest transition-all duration-1000 rotate-[-12deg] select-none"
          style={{ top: `${watermarkPos.top}%`, left: `${watermarkPos.left}%` }}
        >
          {watermarkText}
        </div>

        {/* Secondary Static Background Watermark */}
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center opacity-5 rotate-[-30deg] select-none">
          <span className="font-black text-4xl lg:text-6xl font-mono text-slate-900 uppercase tracking-widest text-center">
            {watermarkText}
          </span>
        </div>

        {/* Content Render Canvas */}
        <div className="flex-1 overflow-auto p-4 lg:p-8 flex items-start justify-center">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 space-y-3">
              <Loader2 className="w-8 h-8 text-blue-700 animate-spin" />
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Decrypting & Rendering Protected PDF...</p>
            </div>
          ) : loadingError ? (
            <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs space-y-2 max-w-md text-center">
              <AlertCircle className="w-8 h-8 mx-auto text-red-600" />
              <p className="font-bold">{loadingError}</p>
            </div>
          ) : (
            <div className={`relative shadow-2xl rounded-lg overflow-hidden border border-slate-300 dark:border-slate-800 ${themeMode === 'sepia' ? 'sepia-[0.3]' : themeMode === 'dark' ? 'invert-[0.9] hue-rotate-180' : ''}`}>
              <canvas ref={canvasRef} className="block" />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Progress Bar & Navigation */}
      <div className={`px-6 py-2.5 border-t flex items-center justify-between text-xs shrink-0 ${themeMode === 'dark' ? 'bg-[#18191a] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
        <div className="flex items-center gap-3">
          <span className="font-bold">Progress: {Math.round((currentPage / totalPages) * 100)}%</span>
          <div className="w-32 lg:w-48 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-800 h-full transition-all duration-300 rounded-full"
              style={{ width: `${(currentPage / totalPages) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg font-bold disabled:opacity-30 transition-colors"
          >
            Previous
          </button>
          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            className="px-3.5 py-1.5 bg-blue-800 text-white hover:bg-blue-900 rounded-lg font-bold disabled:opacity-30 transition-colors"
          >
            Next Page
          </button>
        </div>
      </div>
    </div>
  );
};
