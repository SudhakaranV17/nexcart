"use client";

import { QueryClientProvider as CustomQueryClientProvider } from '@/shared/providers/query/QueryClientProvider.provider';

type ProvidersProps = {
  children: React.ReactNode;
};

export default function Providers({ children }: ProvidersProps) {
  return (
    <CustomQueryClientProvider>
        {children}
    </CustomQueryClientProvider>
  );
}
