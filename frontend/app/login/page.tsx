import { LoginForm } from "@/components/login-form"
import Link from "next/link"
import { AuthRedirect } from "@/components/auth-redirect"

export default function LoginPage() {
  return (
    <>
      <AuthRedirect />
    <div className="min-h-screen flex flex-col">
      <div className="container max-w-md mx-auto flex-1 flex flex-col justify-center px-4 py-12">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold">Welcome back</h1>
          <p className="text-muted-foreground mt-2">Sign in to your account to continue</p>
        </div>

        <div className="bg-card border rounded-lg shadow-sm p-6">
          <LoginForm />

          <div className="mt-6 text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
