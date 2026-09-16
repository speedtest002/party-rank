import { useAuth, useUser, useClerk, SignedIn, SignedOut, SignIn, UserButton } from '@clerk/clerk-react';

export { SignedIn, SignedOut, SignIn, UserButton };

export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

/**
 * useSession – returns { data: session, isPending }
 * Compatible shape with the old Better Auth API so Header/ParticipantRank work unchanged.
 */
export function useSession() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  if (!isLoaded) {
    return { data: null, isPending: true };
  }

  if (!isSignedIn) {
    return { data: null, isPending: false };
  }

  return {
    data: {
      user: {
        name: user.fullName || user.firstName || 'User',
        image: user.imageUrl,
        email: user.primaryEmailAddress?.emailAddress,
      },
    },
    isPending: false,
  };
}

/**
 * signIn – Clerk-compatible wrapper for social login.
 * Must be called inside a ClerkProvider context.
 */
export function signIn() {
  const clerk = useClerk();
  return {
    social: async ({ provider }: { provider: string }) => {
      clerk.openSignIn({ strategy: `oauth_${provider}` });
    },
  };
}

/**
 * signOut – Clerk-compatible wrapper.
 * Must be called inside a ClerkProvider context.
 */
export function signOut() {
  const clerk = useClerk();
  clerk.signOut();
}
