"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'; // Added useCallback
import { User } from 'firebase/auth'; // Import User type from firebase/auth
import { auth, onAuthStateChanged, googleProvider, signInWithPopup } from '@/lib/firebase'; // Import necessary firebase functions and provider
import { useRouter } from 'next/navigation'; // Use for potential redirects on auth state change

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  getIdToken: () => Promise<string | null>;
  signInWithGoogle: () => Promise<void>; // Add signInWithGoogle function type
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter(); // Optional: for redirect logic

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("Auth State Changed:", user ? user.email : 'No user');
      setCurrentUser(user);
      setCurrentUser(user);
      setLoading(false);

      // Redirect logic: If user logs in and is on login/signup page, redirect to dashboard
      if (user && (window.location.pathname === '/login' || window.location.pathname === '/signup')) {
        console.log("User logged in, redirecting to dashboard...");
        router.push('/dashboard');
      } 
      // Optional: Redirect to login if user logs out and is not on a public page
      // else if (!user && window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
      //   console.log("User logged out, redirecting to login...");
      //   router.push('/login');
      // }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [router]); // Add router if used in effect

  // Function to get the current user's ID token
  const getIdToken = async (): Promise<string | null> => {
    if (!currentUser) {
      console.log("getIdToken: No current user");
      return null;
    }
    try {
      const token = await currentUser.getIdToken(true); // Force refresh if needed
      console.log("getIdToken: Token retrieved");
      return token;
    } catch (error) {
      console.error("Error getting ID token:", error);
      // Handle error appropriately, maybe sign out user
      // await auth.signOut(); // Example: sign out on token error
      return null;
    }
  };

  // Function to sign in with Google
  const signInWithGoogle = useCallback(async () => {
    setLoading(true); // Indicate loading state
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // The onAuthStateChanged listener will handle setting the user and loading state
      console.log("Google Sign-In successful:", result.user.email);
      // Optionally redirect after successful Google sign-in
      // router.push('/dashboard'); // Uncomment and adjust if needed
    } catch (error) {
      console.error("Error during Google Sign-In:", error);
      // Handle specific errors (e.g., popup closed, network error) if necessary
      setLoading(false); // Reset loading state on error
    }
    // No need to setLoading(false) on success here, as onAuthStateChanged handles it
  }, [router]); // Add router if used for redirection

  const value = {
    currentUser,
    loading,
    getIdToken,
    signInWithGoogle, // Add the function to the context value
  };

  // Don't render children until loading is complete to avoid rendering protected content prematurely
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
