import { Button } from "@/components/ui/button"
import Link from "next/link"
import { AuthRedirect } from "@/components/auth-redirect"

export default function Home() {
  return (
    <>
      <AuthRedirect />
    <div className="flex flex-col min-h-screen">
      <header className="border-b">
        <div className="container mx-auto py-4 px-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold">Open Upload</h1>
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/login">
              <Button variant="outline">Login</Button>
            </Link>
            <Link href="/signup">
              <Button>Sign Up</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="py-20 px-4">
          <div className="container mx-auto max-w-5xl text-center">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">Simple, powerful file uploads</h1>
            <p className="text-xl text-muted-foreground mb-10 max-w-3xl mx-auto">
              Upload, manage, and share your files with ease. Create project-specific APIs and integrate with your
              applications.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link href="/signup">
                <Button size="lg" className="w-full sm:w-auto">
                  Get Started
                </Button>
              </Link>
              <Link href="/docs">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  View Documentation
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-background p-6 rounded-lg shadow-sm">
                <h3 className="text-xl font-semibold mb-3">Project Management</h3>
                <p className="text-muted-foreground">
                  Create and manage multiple projects with separate storage and configurations.
                </p>
              </div>
              <div className="bg-background p-6 rounded-lg shadow-sm">
                <h3 className="text-xl font-semibold mb-3">API Integration</h3>
                <p className="text-muted-foreground">
                  Generate API keys for each project and integrate file uploads into your applications.
                </p>
              </div>
              <div className="bg-background p-6 rounded-lg shadow-sm">
                <h3 className="text-xl font-semibold mb-3">Powerful Search</h3>
                <p className="text-muted-foreground">Quickly find your files with our powerful search functionality.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Open Upload. All rights reserved.
        </div>
      </footer>
    </div>
    </>
  )
}
