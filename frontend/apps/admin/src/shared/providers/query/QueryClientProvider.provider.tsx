"use client";

import {
  QueryCache,
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider
} from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { toast, Toaster } from 'react-hot-toast';
import { useState } from 'react';
import { toastService } from '../toastProvider/ToastProvider.provider';

export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error: unknown) => {
          const err = error as AxiosError;
          if (
            err?.response?.status === 400 ||
            err?.response?.status === 401
          ) {
            return false;
          }
          return failureCount <= 3;
        },
        refetchOnWindowFocus: false,
      },
    },
    queryCache: new QueryCache({
      onError: async (error: unknown) => {
        const err = error as AxiosError;
        if (err?.response?.status === 401) {
          toast.dismiss();
          toastService.errorToast('Your session has expired', 'SESSION_EXPIRY');
          return;
        }
      },
    }),
  }));

  return (
    <TanstackQueryClientProvider client={queryClient}>
      <Toaster />
      {children}
    </TanstackQueryClientProvider>
  );
}
