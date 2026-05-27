import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AuthUser {
  id: string;
  email: string;
  role: string;
  orgId: string | null;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  // Saved state during org impersonation
  previousToken: string | null;
  previousUser: AuthUser | null;
  impersonatingOrgName: string | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  impersonate: (token: string, user: AuthUser, orgName: string) => void;
  exitImpersonation: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      previousToken: null,
      previousUser: null,
      impersonatingOrgName: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () =>
        set({
          token: null,
          user: null,
          previousToken: null,
          previousUser: null,
          impersonatingOrgName: null,
        }),
      impersonate: (token, user, orgName) => {
        const { token: currentToken, user: currentUser } = get();
        set({
          token,
          user,
          previousToken: currentToken,
          previousUser: currentUser,
          impersonatingOrgName: orgName,
        });
      },
      exitImpersonation: () => {
        const { previousToken, previousUser } = get();
        set({
          token: previousToken,
          user: previousUser,
          previousToken: null,
          previousUser: null,
          impersonatingOrgName: null,
        });
      },
    }),
    {
      name: 'vpn-auth',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
