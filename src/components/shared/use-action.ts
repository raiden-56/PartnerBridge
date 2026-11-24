"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Result<T> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Runs a server action with pending state, toasts and field-error handling.
 * Server actions always re-validate and re-authorize; this hook is UX only.
 */
export function useAction<Args extends unknown[], T>(
  action: (...args: Args) => Promise<Result<T>>,
  opts: { successMessage?: string; refresh?: boolean; onSuccess?: (data?: T) => void } = {},
) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const run = React.useCallback(
    async (...args: Args): Promise<Result<T>> => {
      setPending(true);
      setFieldErrors({});
      try {
        const res = await action(...args);
        if (res.ok) {
          const msg = res.message ?? opts.successMessage;
          if (msg) toast.success(msg);
          opts.onSuccess?.(res.data);
          if (opts.refresh !== false) router.refresh();
        } else {
          setFieldErrors(res.fieldErrors ?? {});
          toast.error(res.error);
        }
        return res;
      } catch (e) {
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        const error = offline ? "You're offline. This action needs an internet connection." : "Something went wrong. Please try again.";
        toast.error(error);
        console.error(e);
        return { ok: false, error };
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action, router],
  );

  return { run, pending, fieldErrors, setFieldErrors };
}
