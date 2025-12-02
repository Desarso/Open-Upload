"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderIcon, MoreHorizontal, AlertCircle } from "lucide-react"; // Added AlertCircle
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Project, ProjectStats, getProjectStats } from "@/lib/apiClient";
import { Skeleton } from "@/components/ui/skeleton"; // For loading state
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // For error state
import { useAuth } from "@/context/AuthContext"; // To get token for delete
import { deleteProject as deleteProjectApi } from "@/lib/apiClient"; // Import delete function
import { useState, useEffect } from "react";
import { toast } from "@/components/ui/use-toast"; // For user feedback

interface ProjectListProps {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  onProjectDeleted: () => void;
}

interface ProjectStatsMap {
  [key: number]: {
    stats: ProjectStats | null;
    isLoading: boolean;
    error: string | null;
  };
}

// Helper function to format bytes
const formatBytes = (bytes: number): string => {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

export function ProjectList({ projects, isLoading, error, onProjectDeleted }: ProjectListProps) {
  const { getIdToken } = useAuth();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [projectStats, setProjectStats] = useState<ProjectStatsMap>({});
  const safeProjects = projects ?? [];

  // Fetch stats for each project
  useEffect(() => {
    const fetchProjectStats = async () => {
      const token = await getIdToken();
      if (!token) return;

      safeProjects.forEach(async (project) => {
        // Skip if already loading
        if (projectStats[project.id]?.isLoading) return;

        setProjectStats(prev => ({
          ...prev,
          [project.id]: { stats: null, isLoading: true, error: null }
        }));

        try {
          const stats = await getProjectStats(token, project.id);
          setProjectStats(prev => ({
            ...prev,
            [project.id]: { stats, isLoading: false, error: null }
          }));
        } catch (err: any) {
          setProjectStats(prev => ({
            ...prev,
            [project.id]: { stats: null, isLoading: false, error: err.message }
          }));
        }
      });
    };

    fetchProjectStats();
  }, [projects, getIdToken]);

  const handleDelete = async (projectId: number) => {
    if (deletingId) return; // Prevent multiple deletes at once

    setDeletingId(projectId);
    const token = await getIdToken();
    if (!token) {
      toast({ variant: "destructive", title: "Error", description: "Authentication token not found." });
      setDeletingId(null);
      return;
    }

    try {
      await deleteProjectApi(token, projectId);
      toast({ title: "Success", description: "Project deleted successfully." });
      onProjectDeleted(); // Trigger refresh in parent component
    } catch (err: any) {
      console.error("Failed to delete project:", err);
      toast({ variant: "destructive", title: "Error", description: err.message || "Failed to delete project." });
    } finally {
      setDeletingId(null); // Reset deleting state
    }
  };


  // Loading State
  if (isLoading) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">Your Projects</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, index) => ( // Show 3 skeleton loaders
            <Card key={index}>
              <CardHeader className="pb-3">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
              <CardFooter className="pt-1">
                <Skeleton className="h-8 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
       <div>
        <h2 className="text-xl font-semibold mb-4">Your Projects</h2>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Projects</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // No Projects State
  if (safeProjects.length === 0) {
     return (
       <div>
        <h2 className="text-xl font-semibold mb-4">Your Projects</h2>
        <p className="text-muted-foreground">You haven't created any projects yet.</p>
        {/* Optionally add a Create Project button here too */}
      </div>
     );
  }

  // Success State (Data Loaded)
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Your Projects</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {safeProjects.map((project) => (
          <Card key={project.id}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-2">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <FolderIcon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle>{project.name}</CardTitle>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={deletingId === project.id}>
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/projects/${project.id}`}>View</Link>
                    </DropdownMenuItem>
                    {/* <DropdownMenuItem asChild>
                      <Link href={`/dashboard/projects/${project.id}/settings`}>Settings</Link>
                    </DropdownMenuItem> */}
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleDelete(project.id)}
                      disabled={deletingId === project.id}
                    >
                      {deletingId === project.id ? "Deleting..." : "Delete"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <CardDescription>{project.description || "No description provided."}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Files</p>
                  {projectStats[project.id]?.isLoading ? (
                    <div className="animate-pulse">
                      <div className="h-5 bg-muted rounded w-12"></div>
                    </div>
                  ) : projectStats[project.id]?.error ? (
                    <p className="font-medium text-destructive">Error</p>
                  ) : (
                    <p className="font-medium">
                      {projectStats[project.id]?.stats?.total_files.toLocaleString() ?? '0'}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Storage</p>
                  {projectStats[project.id]?.isLoading ? (
                    <div className="animate-pulse">
                      <div className="h-5 bg-muted rounded w-16"></div>
                    </div>
                  ) : projectStats[project.id]?.error ? (
                    <p className="font-medium text-destructive">Error</p>
                  ) : (
                    <p className="font-medium">
                      {formatBytes(projectStats[project.id]?.stats?.total_storage ?? 0)}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-1">
              <div className="w-full flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                    Created {new Date(project.created_at).toLocaleDateString()}
                </p>
                <Button size="sm" asChild>
                  <Link href={`/dashboard/projects/${project.id}`}>Go to Project</Link>
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
