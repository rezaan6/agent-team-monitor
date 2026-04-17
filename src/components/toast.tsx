"use client";

import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const styles = {
    success: {
      bg: "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800",
      text: "text-emerald-800 dark:text-emerald-300",
      icon: <CheckCircle className="h-4 w-4 text-emerald-500" />,
    },
    error: {
      bg: "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800",
      text: "text-red-800 dark:text-red-300",
      icon: <AlertCircle className="h-4 w-4 text-red-500" />,
    },
    info: {
      bg: "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800",
      text: "text-blue-800 dark:text-blue-300",
      icon: <Info className="h-4 w-4 text-blue-500" />,
    },
  };

  const style = styles[toast.type];

  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-lg animate-in slide-in-from-right-5 fade-in duration-300 ${style.bg}`}
    >
      {style.icon}
      <p className={`text-sm font-medium ${style.text}`}>{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="ml-2 cursor-pointer rounded-md p-1 text-gray-400 transition-[background-color,color,transform] duration-150 hover:bg-gray-200/50 hover:text-gray-600 dark:hover:bg-gray-700/50 dark:hover:text-gray-300 active:scale-95"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
