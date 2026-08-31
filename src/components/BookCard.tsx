import React from 'react';
import { Book } from '../types';
import { Bookmark, Star, Eye, ShoppingCart } from 'lucide-react';

interface BookCardProps {
  book: Book;
  isSaved: boolean;
  onSelectBook: (book: Book) => void;
  onAddToCart: (book: Book) => void;
  onToggleSave: (book: Book) => void;
  onPreviewExcerpt: (book: Book) => void;
}

export const BookCard: React.FC<BookCardProps> = ({
  book,
  isSaved,
  onSelectBook,
  onAddToCart,
  onToggleSave,
  onPreviewExcerpt,
}) => {
  return (
    <div
      id={`book-card-${book.id}`}
      className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md border border-slate-200 flex flex-col transition-all duration-200 group relative"
    >
      {/* Top Badge Overlay */}
      <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900/80 backdrop-blur text-white shadow-sm">
          {book.format}
        </span>
        {book.isBestseller && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500 text-white shadow-sm">
            Top Syllabus
          </span>
        )}
      </div>

      {/* Bookmark Action Button */}
      <button
        id={`bookmark-btn-${book.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSave(book);
        }}
        className={`absolute top-2.5 right-2.5 z-10 p-1.5 rounded-full backdrop-blur transition-all ${
          isSaved
            ? 'bg-amber-500 text-white shadow-md'
            : 'bg-white/80 text-slate-700 hover:bg-white hover:text-blue-700 shadow-sm'
        }`}
        title={isSaved ? 'Remove from Saved' : 'Save to Library'}
      >
        <Bookmark className="w-3.5 h-3.5 fill-current" />
      </button>

      {/* Cover Header */}
      <div
        onClick={() => onSelectBook(book)}
        className={`h-48 flex items-center justify-center p-6 bg-gradient-to-br ${book.coverGradient} text-white font-bold text-center leading-snug shadow-inner font-serif cursor-pointer relative overflow-hidden group-hover:scale-101 transition-transform`}
      >
        {/* Abstract book background line art */}
        <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
        
        <div className="relative z-1 space-y-1">
          <div className="text-xs uppercase tracking-widest text-white/80 font-sans font-semibold">
            {book.institution.split('(')[1]?.replace(')', '') || 'ACADEMIC'}
          </div>
          <div className="text-base font-bold drop-shadow-sm line-clamp-3">
            {book.title}
          </div>
        </div>

        {/* Quick Read Preview Hover Button */}
        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-4 z-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPreviewExcerpt(book);
            }}
            className="px-3 py-1.5 bg-white text-slate-900 rounded text-xs font-bold shadow-md hover:bg-slate-100 flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5 text-blue-700" />
            Quick Read
          </button>
        </div>
      </div>

      {/* Card Content Details */}
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">
            {book.department}
          </span>
          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>{book.rating.toFixed(1)}</span>
            <span className="text-slate-400 font-normal">({book.reviewCount})</span>
          </div>
        </div>

        <h3
          onClick={() => onSelectBook(book)}
          className="font-bold text-slate-900 text-sm mb-1 line-clamp-2 cursor-pointer hover:text-blue-700 transition-colors leading-snug"
        >
          {book.title}
        </h3>

        <p className="text-xs text-slate-500 mb-4 line-clamp-1 font-medium">
          {book.author}
        </p>

        {/* Footer Row: Price & Action */}
        <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
          <div>
            <span className="text-xs text-slate-400 block font-sans">Price</span>
            <span className="text-lg font-black text-slate-900">
              ₦{book.price.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              id={`cart-add-${book.id}`}
              onClick={() => onAddToCart(book)}
              className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded border border-slate-200 transition-colors"
              title="Add to Cart"
            >
              <ShoppingCart className="w-4 h-4" />
            </button>

            <button
              id={`buy-now-${book.id}`}
              onClick={() => {
                onAddToCart(book);
                onSelectBook(book);
              }}
              className="px-3 py-1.5 bg-blue-700 text-white text-xs font-bold rounded hover:bg-blue-800 transition-colors shadow-sm"
            >
              Buy Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
