import { SignupForm } from "@/components/signup-form"
import Link from "next/link"

export default function SignupPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="container max-w-md mx-auto flex-1 flex flex-col justify-center px-4 py-12">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold">Create an account</h1>
          <p className="text-muted-foreground mt-2">Get started with Open Upload today</p>
        </div>

        <div className="bg-card border rounded-lg shadow-sm p-6">
          <SignupForm />

          <div className="mt-6 text-center text-sm">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
