import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant?: 'danger' | 'warning';
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'danger'
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-stone-900 border border-stone-800 rounded-3xl p-6 shadow-2xl overflow-hidden"
          >
            {/* Background Accent */}
            <div className={`absolute top-0 left-0 w-full h-1 ${variant === 'danger' ? 'bg-red-500' : 'bg-amber-500'}`} />
            
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-2xl ${variant === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>
                <AlertTriangle size={24} />
              </div>
              
              <div className="flex-1">
                <h3 className="text-xl font-bold text-stone-100 mb-2">{title}</h3>
                <p className="text-stone-400 font-light leading-relaxed">
                  {message}
                </p>
              </div>
              
              <button 
                onClick={onClose}
                className="p-1 text-stone-500 hover:text-stone-300 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="mt-8 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 px-4 bg-stone-800 text-stone-300 font-semibold uppercase tracking-widest text-xs rounded-xl hover:bg-stone-700 transition-all"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`flex-1 py-3 px-4 ${variant === 'danger' ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'} text-stone-900 font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-lg shadow-black/20`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
