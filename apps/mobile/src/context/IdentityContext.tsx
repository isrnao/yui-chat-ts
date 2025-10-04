import React, { createContext, useContext, useMemo, useState } from 'react';

export type Identity = {
  name: string;
  color: string;
  email?: string;
  entered: boolean;
};

export type IdentityContextValue = {
  identity: Identity;
  updateIdentity: (patch: Partial<Identity>) => void;
  resetIdentity: () => void;
};

const DEFAULT_IDENTITY: Identity = {
  name: '',
  color: '#2563eb',
  email: '',
  entered: false,
};

const IdentityContext = createContext<IdentityContextValue | undefined>(undefined);

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Identity>(DEFAULT_IDENTITY);

  const value = useMemo(
    () => ({
      identity,
      updateIdentity: (patch: Partial<Identity>) => {
        setIdentity((prev) => ({ ...prev, ...patch }));
      },
      resetIdentity: () => setIdentity(DEFAULT_IDENTITY),
    }),
    [identity],
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity() {
  const context = useContext(IdentityContext);
  if (!context) {
    throw new Error('useIdentity must be used within IdentityProvider');
  }
  return context;
}
