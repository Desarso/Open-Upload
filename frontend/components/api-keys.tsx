"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyIcon, EyeIcon, EyeOffIcon, PlusIcon, TrashIcon, AlertCircle } from "lucide-react"; // Removed RefreshCwIcon, Added AlertCircle
import { toast } from "@/components/ui/use-toast"; // Use shadcn toast
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext"; // Import useAuth
import { ApiKey, createApiKey, deleteApiKey } from "@/lib/apiClient"; // Import API functions and type
import { Skeleton } from "@/components/ui/skeleton"; // For loading state
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // For error state

// Update props to accept initial keys
interface ApiKeysProps {
  projectId: string; // Keep as string from params
  initialApiKeys: ApiKey[];
}

export function ApiKeys({ projectId, initialApiKeys }: ApiKeysProps) {
  const { getIdToken } = useAuth();
  // Initialize state with props
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(initialApiKeys);
  // Local loading/error state specific to this component's actions
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for the create dialog
  const [newKeyName, setNewKeyName] = useState(""); // Name is not part of backend model, maybe remove? For now, keep for UI clarity but don't send to backend.
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Record<number, boolean>>({}); // Use key ID (number) as key

  // Convert projectId string to number for API calls
  const projectIdNum = parseInt(projectId, 10);

  // Effect to update state if initialApiKeys prop changes (e.g., after parent re-fetches)
  useEffect(() => {
    setApiKeys(initialApiKeys);
  }, [initialApiKeys]);

  const toggleKeyVisibility = (id: number) => {
    setVisibleKeys((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    toast({
      title: "API key copied",
      description: `The API key has been copied to your clipboard.`,
    });
  };

  const handleCreateNewKey = async () => {
    if (!newKeyName.trim()) {
        toast({ variant: "destructive", title: "Error", description: "Please provide a name for the API key." });
        return;
    }
    if (isNaN(projectIdNum)) {
        toast({ variant: "destructive", title: "Error", description: "Invalid Project ID." });
        return;
    }

    setIsCreatingKey(true);
    setError(null);
    const token = await getIdToken();

    if (!token) {
      toast({ variant: "destructive", title: "Error", description: "Authentication token not found." });
      setIsCreatingKey(false);
      return;
    }

    try {
      const newKeyData = await createApiKey(token, { 
        project_id: projectIdNum,
        name: newKeyName
      });
      setApiKeys((prev) => [...prev, newKeyData]); // Add the new key from API response
      setNewKeyName(""); // Reset input
      setIsDialogOpen(false); // Close dialog

      // Don't show the key by default
      setVisibleKeys((prev) => ({
        ...prev,
        [newKeyData.id]: false,
      }));

      toast({
        title: "API key created",
        description: "Your new API key has been created. Click the eye icon to reveal it.",
      });
    } catch (err: any) {
      console.error("Failed to create API key:", err);
      setError(err.message || "Failed to create API key.");
      toast({
        title: "Error",
        description: err.message || "Failed to create API key. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleDeleteKey = async (id: number) => {
     // Optional: Add confirmation dialog here
    setIsLoading(true); // Use general loading state for delete
    setError(null);
    const token = await getIdToken();

     if (!token) {
      toast({ variant: "destructive", title: "Error", description: "Authentication token not found." });
      setIsLoading(false);
      return;
    }

    try {
      await deleteApiKey(token, id);
      setApiKeys((prev) => prev.filter((key) => key.id !== id)); // Remove key from local state
      toast({
        title: "API key deleted",
        description: "The API key has been permanently deleted.",
      });
    } catch (err: any) {
      console.error("Failed to delete API key:", err);
      setError(err.message || "Failed to delete API key.");
      toast({
        title: "Error",
        description: err.message || "Failed to delete API key. Please try again.",
        variant: "destructive",
      });
    } finally {
       setIsLoading(false);
    }
  };

  // Remove regenerateKey function

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "Never";
    try {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        }).format(date);
    } catch (e) {
        return "Invalid Date";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">API Keys</h2>
          <p className="text-muted-foreground">Manage API keys for programmatic access</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusIcon className="h-4 w-4 mr-2" />
              New API Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a new API key</DialogTitle>
              <DialogDescription>API keys allow programmatic access. Keep them secure. Provide a descriptive name.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                {/* Name is just for UI identification, not sent to backend */}
                <Label htmlFor="key-name">API Key Name (for your reference)</Label>
                <Input
                  id="key-name"
                  placeholder="e.g., Production, Development"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateNewKey} disabled={isCreatingKey || !newKeyName.trim()}>
                {isCreatingKey ? "Creating..." : "Create API Key"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

       {/* Display general error for the component */}
       {error && (
         <Alert variant="destructive">
           <AlertCircle className="h-4 w-4" />
           <AlertTitle>Error</AlertTitle>
           <AlertDescription>{error}</AlertDescription>
         </Alert>
       )}

      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>Use these keys to authenticate API requests</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isLoading && apiKeys.length === 0 && <Skeleton className="h-20 w-full" />} {/* Show skeleton only if loading and no keys yet */}
            {!isLoading && apiKeys.map((apiKey) => (
              <div key={apiKey.id} className="flex flex-col space-y-2 p-4 border rounded-lg">
                <div className="flex justify-between items-center">
                  {/* Display key name instead of ID */}
                  <h3 className="font-medium">{apiKey.name || `Key ${apiKey.id}`}</h3>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => toggleKeyVisibility(apiKey.id)}
                      title={visibleKeys[apiKey.id] ? "Hide API key" : "Show API key"}
                    >
                      {visibleKeys[apiKey.id] ? (
                        <EyeOffIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(apiKey.key)}
                      title="Copy API key"
                      disabled={!visibleKeys[apiKey.id]} // Disable copy if key is hidden
                    >
                      <CopyIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDeleteKey(apiKey.id)}
                      title="Delete API key"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <code className="bg-muted px-2 py-1 rounded text-sm font-mono flex-1 truncate">
                    {visibleKeys[apiKey.id] ? apiKey.key : "•".repeat(32)}
                  </code>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  {/* Use created_at and last_used_at from backend */}
                  <span>Created: {formatDate(apiKey.created_at)}</span>
                  <span>Last used: {formatDate(apiKey.last_used_at)}</span>
                </div>
              </div>
            ))}

            {!isLoading && apiKeys.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">No API keys created yet for this project.</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Keep API Docs section */}
      <Card>
         <CardHeader>
           <CardTitle>API Documentation</CardTitle>
           <CardDescription>Learn how to use the API to upload and manage files</CardDescription>
         </CardHeader>
         <CardContent>
           {/* ... (rest of API docs section remains the same) ... */}
            <div className="space-y-4">
            <div>
              <h3 className="font-medium mb-2">Upload a file</h3>
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                <code>{`curl -X POST ${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/v1/files/upload \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -F "file=@/path/to/file.jpg"`}</code>
              </pre>
            </div>

            <div>
              <h3 className="font-medium mb-2">List files</h3>
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                <code>{`curl -X GET "${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/v1/files/list?prefix=uploads/1" \\
  -H "X-API-Key: YOUR_API_KEY"`}</code>
              </pre>
              <p className="text-sm text-muted-foreground mt-1">Optional: Add <code>?prefix=uploads/PROJECT_ID</code> to filter by project</p>
            </div>

            <div>
              <h3 className="font-medium mb-2">Generate transform URL</h3>
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                <code>{`curl -X GET "${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/v1/files/transform-url?key=FILE_KEY&w=800&h=600&format=webp" \\
  -H "X-API-Key: YOUR_API_KEY"`}</code>
              </pre>
              <p className="text-sm text-muted-foreground mt-1">Generate imgproxy URLs for image transformations. Use <code>preset</code> (thumbnail, medium, preview, full) or <code>w</code>/<code>h</code> for custom dimensions.</p>
            </div>

            <div>
              <h3 className="font-medium mb-2">Get a file</h3>
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                <code>{`curl -X GET ${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/v1/files/FILE_KEY \\
  -H "X-API-Key: YOUR_API_KEY"`}</code>
              </pre>
              <p className="text-sm text-muted-foreground mt-1">Returns a redirect to a presigned download URL (valid for 15 minutes). Use the file key from upload/list responses.</p>
            </div>

            <div>
              <h3 className="font-medium mb-2">Delete a file</h3>
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                <code>{`curl -X DELETE ${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/v1/files/FILE_KEY \\
  -H "X-API-Key: YOUR_API_KEY"`}</code>
              </pre>
              <p className="text-sm text-muted-foreground mt-1">Use the file key from upload/list responses.</p>
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="font-semibold mb-3">Public File Endpoints (No API Key Required)</h3>
              <p className="text-sm text-muted-foreground mb-4">These endpoints use the file ID from the database and work for images only.</p>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Get file by ID</h4>
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                    <code>{`curl -X GET ${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/files/FILE_ID`}</code>
                  </pre>
                  <p className="text-sm text-muted-foreground mt-1">Download the original file. Use the file ID from upload responses.</p>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Get thumbnail (120px height)</h4>
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                    <code>{`curl -X GET ${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/files/FILE_ID/thumbnail`}</code>
                  </pre>
                  <p className="text-sm text-muted-foreground mt-1">Returns a WebP thumbnail image (120px height, aspect ratio preserved).</p>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Get medium size (320px height)</h4>
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                    <code>{`curl -X GET ${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/files/FILE_ID/medium`}</code>
                  </pre>
                  <p className="text-sm text-muted-foreground mt-1">Returns a WebP image at medium size (320px height, aspect ratio preserved).</p>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Get preview size (720px height)</h4>
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                    <code>{`curl -X GET ${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/files/FILE_ID/preview`}</code>
                  </pre>
                  <p className="text-sm text-muted-foreground mt-1">Returns a WebP image at preview size (720px height, aspect ratio preserved).</p>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Get full size (1080px height)</h4>
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                    <code>{`curl -X GET ${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/files/FILE_ID/full`}</code>
                  </pre>
                  <p className="text-sm text-muted-foreground mt-1">Returns a WebP image at full size (1080px height, aspect ratio preserved).</p>
                </div>
              </div>
            </div>

            <div className="text-center mt-6">
              <Button variant="outline" asChild>
                <a href="/docs" target="_blank" rel="noreferrer">
                  View full API documentation
                </a>
              </Button>
            </div>
          </div>
         </CardContent>
       </Card>
    </div>
  );
}
