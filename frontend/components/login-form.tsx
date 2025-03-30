"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"
import { useAuth } from "@/context/AuthContext"; // Import useAuth hook
import { auth, signInWithEmailAndPassword } from "@/lib/firebase" // Import Firebase auth functions
import { FirebaseError } from "firebase/app" // Import FirebaseError for specific error handling
import { Separator } from "@/components/ui/separator"; // Import Separator
import { FcGoogle } from "react-icons/fc"; // Import Google icon (assuming react-icons is installed)

export function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false) // Loading state for email/password form
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { signInWithGoogle, loading: authLoading } = useAuth(); // Get Google sign-in function and auth loading state

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      // Use Firebase to sign in
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      console.log("User signed in:", userCredential.user)
      // On successful login, redirect to the dashboard
      router.push("/dashboard")
    } catch (err) {
      console.error("Firebase Auth Error:", err)
      if (err instanceof FirebaseError) {
        // Handle specific Firebase errors
        switch (err.code) {
          case 'auth/invalid-email':
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential': // Covers invalid email/password combination
            setError("Invalid email or password.")
            break;
          case 'auth/too-many-requests':
            setError("Too many login attempts. Please try again later.")
            break;
          default:
            setError("An unexpected error occurred during login. Please try again.")
        }
      } else {
         setError("An unexpected error occurred. Please try again.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox id="remember" />
        <Label htmlFor="remember" className="text-sm font-normal">
          Remember me
        </Label>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading || authLoading}>
        {isLoading ? "Signing in..." : "Sign in"}
      </Button>

      <div className="relative my-4">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
          OR CONTINUE WITH
        </span>
      </div>

      <Button
        variant="outline"
        className="w-full flex items-center justify-center gap-2"
        onClick={async (e) => {
          e.preventDefault(); // Prevent form submission if inside form
          await signInWithGoogle();
          // Redirect is handled by AuthContext or onAuthStateChanged listener
        }}
        disabled={isLoading || authLoading}
      >
        <FcGoogle className="h-5 w-5" />
        Sign in with Google
      </Button>
    </form>
  )
}
