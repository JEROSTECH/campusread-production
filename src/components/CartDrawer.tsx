import React, { useState } from 'react';
import { CartItem } from '../types';
import { X, Trash2, ShoppingBag, ShieldCheck, Tag, ArrowRight, CheckCircle2 } from 'lucide-react';

interface CartDrawerProps {
  isOpen: boolean;
  cartItems: CartItem[];
  onClose: () => void;
  onUpdateQuantity: (bookId: string, quantity: number) => void;
  onRemoveItem: (bookId: string) => void;
  onClearCart: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  cartItems,
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}) => {
  const [promoCode, setPromoCode] = useState('');
  const [discountApplied, setDiscountApplied] = useState(false);
  const [isCheckoutSuccess, setIsCheckoutSuccess] = useState(false);

  if (!isOpen) return null;

  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.book.price * item.quantity,
    0
  );
  const discountAmount = discountApplied ? Math.round(subtotal * 0.1) : 0;
  const platformFee = cartItems.length > 0 ? 200 : 0;
  const grandTotal = Math.max(0, subtotal - discountAmount + platformFee);

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    if (promoCode.trim().toUpperCase() === 'STUDENT10' || promoCode.trim().toUpperCase() === 'CAMPUS10') {
      setDiscountApplied(true);
    } else {
      alert('Invalid code. Try "STUDENT10" for 10% student discount!');
    }
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) return;
    setIsCheckoutSuccess(true);
  };

  const handleFinishCheckout = () => {
    setIsCheckoutSuccess(false);
    onClearCart();
    onClose();
  };

  return (
    <div id="cart-drawer-overlay" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-end">
      <div id="cart-drawer-container" className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <ShoppingBag className="w-5 h-5 text-blue-700" />
            <span>Your Cart ({cartItems.reduce((acc, i) => acc + i.quantity, 0)})</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {isCheckoutSuccess ? (
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Payment Successful!</h2>
            <p className="text-sm text-slate-600 max-w-xs">
              Your academic textbooks have been added to your E-Reader Library account. You can now read offline or print.
            </p>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 w-full text-left space-y-2 text-xs text-slate-700 font-medium">
              <div className="flex justify-between">
                <span>Receipt Ref:</span>
                <span className="font-mono font-bold">CR-2024-8841</span>
              </div>
              <div className="flex justify-between">
                <span>Amount Paid:</span>
                <span className="font-bold text-slate-900">₦{grandTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Access Granted:</span>
                <span className="text-emerald-700 font-bold">Instant Digital DRM</span>
              </div>
            </div>

            <button
              onClick={handleFinishCheckout}
              className="w-full py-3 bg-blue-700 text-white font-bold rounded-lg shadow hover:bg-blue-800 transition-colors text-sm"
            >
              Open E-Reader Library
            </button>
          </div>
        ) : cartItems.length === 0 ? (
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Your cart is empty</h3>
            <p className="text-xs text-slate-500 max-w-xs">
              Browse textbooks from top lecturers and add them to your cart to prepare for your semester courses.
            </p>
          </div>
        ) : (
          <>
            {/* Item List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {cartItems.map((item) => (
                <div
                  key={item.book.id}
                  className="flex gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 relative group"
                >
                  <div className={`w-14 h-18 rounded-md bg-gradient-to-br ${item.book.coverGradient} text-white text-[9px] font-bold p-1.5 flex flex-col justify-between shrink-0 shadow-sm font-serif`}>
                    <span className="truncate">{item.book.department}</span>
                    <span className="line-clamp-2 leading-tight">{item.book.title}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-900 text-xs line-clamp-1">
                      {item.book.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 truncate">
                      {item.book.author}
                    </p>
                    <div className="text-xs font-black text-slate-900 mt-1">
                      ₦{item.book.price.toLocaleString()}
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => onUpdateQuantity(item.book.id, item.quantity - 1)}
                        className="w-5 h-5 bg-white border border-slate-300 rounded text-slate-600 font-bold flex items-center justify-center text-xs hover:bg-slate-100"
                      >
                        -
                      </button>
                      <span className="text-xs font-bold text-slate-800">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQuantity(item.book.id, item.quantity + 1)}
                        className="w-5 h-5 bg-white border border-slate-300 rounded text-slate-600 font-bold flex items-center justify-center text-xs hover:bg-slate-100"
                      >
                        +
                      </button>

                      <button
                        onClick={() => onRemoveItem(item.book.id)}
                        className="ml-auto text-slate-400 hover:text-rose-600 p-1"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Promo Code Input */}
              <form onSubmit={handleApplyPromo} className="pt-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      placeholder="Promo Code (e.g. STUDENT10)"
                      className="w-full pl-8 pr-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:border-blue-500 outline-none uppercase"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors"
                  >
                    Apply
                  </button>
                </div>
                {discountApplied && (
                  <p className="text-[11px] font-bold text-emerald-600 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    10% Student discount applied!
                  </p>
                )}
              </form>
            </div>

            {/* Footer Summary & Checkout */}
            <div className="p-6 border-t border-slate-200 bg-slate-50 space-y-3">
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-900">₦{subtotal.toLocaleString()}</span>
                </div>
                {discountApplied && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Student Discount (10%)</span>
                    <span>-₦{discountAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>DRM License & Campus Processing</span>
                  <span className="font-semibold text-slate-900">₦{platformFee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-black text-slate-900">
                  <span>Total Amount</span>
                  <span className="text-blue-700">₦{grandTotal.toLocaleString()}</span>
                </div>
              </div>

              <button
                id="checkout-btn"
                onClick={handleCheckout}
                className="w-full py-3 bg-blue-700 text-white font-bold rounded-lg shadow-md hover:bg-blue-800 transition-all flex items-center justify-center gap-2 text-sm"
              >
                <span>Proceed to Payment</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Verified University Rights & Secure Student Checkout</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
