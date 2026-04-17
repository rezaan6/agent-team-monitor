"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export function UserMenu() {
  const user = useCurrentUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  if (!user) {
    return (
      <div className="h-7 w-7 animate-pulse rounded-full bg-gray-200 dark:bg-gray-800" />
    );
  }

  const initial = user.email[0]?.toUpperCase() ?? "?";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-2 rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-1 pr-3 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-300 transition-[background-color,transform] duration-150 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95"
        title={user.email}
      >
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white ${
            user.isDemo ? "bg-amber-500" : "bg-blue-600"
          }`}
        >
          {initial}
        </span>
        <span className="hidden max-w-[160px] truncate sm:inline">{user.email}</span>
        {user.isDemo && (
          <span className="hidden rounded-full bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 sm:inline">
            Demo
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="border-b border-gray-100 dark:border-gray-800 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Signed in as
            </p>
            <p className="mt-0.5 truncate text-xs font-medium text-gray-900 dark:text-gray-100">
              {user.email}
            </p>
            {user.isDemo && (
              <p className="mt-1 rounded-md bg-amber-50 dark:bg-amber-900/20 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-400">
                Demo account — viewing sandboxed sample data.
              </p>
            )}
          </div>
          <button
            onClick={logout}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// Also exported for the skeleton header state.
export function UserMenuPlaceholder() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-1 pr-3 py-1">
      <div className="h-5 w-5 animate-pulse rounded-full bg-gray-200 dark:bg-gray-800" />
      <div className="hidden h-3 w-28 animate-pulse rounded bg-gray-200 dark:bg-gray-800 sm:block" />
      <User className="h-3 w-3 text-transparent" />
    </div>
  );
}
