"use client";

import { useEffect, useState, use } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { Uploader } from "@/components/uploader";
import { FileList } from "@/components/file-list";
import { ProjectSettings } from "@/components/project-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiKeys } from "@/components/api-keys";
import { useAuth } from "@/context/AuthContext"; // Import useAuth
import { getProject, ProjectWithKeys } from "@/lib/apiClient"; // Import API function and type
import { Skeleton } from "@/components/ui/skeleton"; // For loading state
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // For error state
import { AlertCircle } from "lucide-react";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { currentUser, getIdToken } = useAuth();
  const [projectData, setProjectData] = useState<ProjectWithKeys | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { id } = use(params);
  const projectId = parseInt(id, 10); // Ensure ID is a number

  useEffect(() => {
    const fetchProjectData = async () => {
      if (isNaN(projectId)) {
        setError("Invalid project ID.");
        setIsLoading(false);
        return;
      }
      if (!currentUser) {
        // Wait for auth context to load
        return;
      }

      setIsLoading(true);
      setError(null);
      const token = await getIdToken();

      if (!token) {
        setError("Authentication token not available.");
        setIsLoading(false);
        return;
      }

      try {
        const data = await getProject(token, projectId);
        setProjectData(data);
      } catch (err: any) {
        console.error("Failed to fetch project data:", err);
        setError(err.message || "Failed to load project details.");
      } finally {
        setIsLoading(false);
      }
    };

    // Only fetch if currentUser is loaded (to ensure getIdToken works)
    if (currentUser) {
        fetchProjectData();
    } else if (!useAuth().loading) { // If auth is done loading and still no user
        setError("You must be logged in to view this page.");
        setIsLoading(false);
    }
    // Dependency on currentUser ensures fetch runs when user logs in.
  }, [currentUser, getIdToken, projectId]);


  // Loading State
  if (isLoading && !projectData) { // Show loading skeleton only on initial load
    return (
      <div className="min-h-screen flex flex-col">
        <DashboardHeader />
        <main className="flex-1 container mx-auto py-8 px-4">
          <div className="mb-8">
            <Skeleton className="h-10 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-10 w-1/3 mb-6" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  // Error State
  if (error) {
     return (
      <div className="min-h-screen flex flex-col">
        <DashboardHeader />
        <main className="flex-1 container mx-auto py-8 px-4">
           <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </main>
      </div>
     );
  }

  // No Project Data Found (after loading and no error)
  if (!projectData) {
     return (
      <div className="min-h-screen flex flex-col">
        <DashboardHeader />
        <main className="flex-1 container mx-auto py-8 px-4">
           <p>Project not found or you do not have permission to view it.</p>
        </main>
      </div>
     );
  }

  // Success State
  return (
    <div className="min-h-screen flex flex-col">
      <DashboardHeader />

      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="mb-8">
          {/* Use fetched project name */}
          <h1 className="text-3xl font-bold">Project: {projectData.name}</h1>
          <p className="text-muted-foreground">{projectData.description || "Manage files and settings for this project"}</p>
        </div>

        <Tabs defaultValue="files">
          <TabsList className="mb-6">
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="api">API Keys</TabsTrigger>
            {/* <TabsTrigger value="settings">Settings</TabsTrigger> */} {/* Hide settings for now */}
          </TabsList>

          <TabsContent value="files" className="space-y-6">
            {/* Pass projectId as string */}
            <Uploader projectId={id} />
            <FileList projectId={id} />
          </TabsContent>

          <TabsContent value="api">
            {/* Pass projectId as string and fetched API keys */}
            <ApiKeys projectId={id} initialApiKeys={projectData.api_keys} />
          </TabsContent>

          {/* <TabsContent value="settings">
            <ProjectSettings projectId={params.id} projectData={projectData} />
          </TabsContent> */} {/* Pass project data if needed */}
          {/* Removed extra </TabsContent> here */}
        </Tabs>
      </main>
    </div>
  )
}
