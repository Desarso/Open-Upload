import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle } from "lucide-react"

export function UploadLimits() {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Upload Limits</CardTitle>
        <CardDescription>Current limits for your free account</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="flex items-center gap-4">
            <CheckCircle className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">File size limit</p>
              <p className="text-sm text-muted-foreground">Up to 16MB per file</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <CheckCircle className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Storage limit</p>
              <p className="text-sm text-muted-foreground">100MB total storage</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <CheckCircle className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">File types</p>
              <p className="text-sm text-muted-foreground">Images, documents, videos, and more</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <CheckCircle className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Retention period</p>
              <p className="text-sm text-muted-foreground">Files stored for 30 days</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

