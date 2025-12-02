"use client"; // Add "use client" directive for hooks

import { useEffect, useState } from "react";
import { ProjectList } from "@/components/project-list";
import { DashboardHeader } from "@/components/dashboard-header";
import { CreateProjectButton } from "@/components/create-project-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getProjects, Project, getDashboardStats, DashboardStats } from "@/lib/apiClient";

// Define an interface matching the UserRead model from backend/models.py
interface UserData {
  firebase_uid: string; // Matches UserRead model
  email: string;
  created_at: string; // Matches UserRead model
  // Roles are not part of the DB User model directly
}

export default function DashboardPage() {
  const { currentUser, getIdToken } = useAuth(); // Get user and token function
  const [userData, setUserData] = useState<UserData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Helper function to format bytes to human readable format
  const formatBytes = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Function to trigger data refresh
  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    const fetchData = async () => { // Renamed function
      if (!currentUser) {
        console.log("Dashboard: No user logged in.");
        setIsLoading(false);
        // Optionally redirect or show a message if no user is logged in
        // router.push('/login');
        return;
      }

      setIsLoading(true);
      setError(null);
      setProjects([]); // Reset projects on new fetch
      const token = await getIdToken();

      if (!token) {
        setError("Could not retrieve authentication token.");
        setIsLoading(false);
        return;
      }

      // Ensure the backend URL is configured in environment variables
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
          setError("Backend URL is not configured. Please set NEXT_PUBLIC_BACKEND_URL.");
          setIsLoading(false);
          return;
      }

      try {
        // Fetch User Data, Projects, and Dashboard Stats in parallel
        const [fetchedUserDataResponse, fetchedProjects, fetchedStats] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          getProjects(token),
          getDashboardStats(token)
        ]);

        // Process user data response
        if (!fetchedUserDataResponse.ok) {
          const errorData = await fetchedUserDataResponse.json();
          throw new Error(errorData.detail || `Failed to fetch user data: ${fetchedUserDataResponse.status}`);
        }
        const fetchedUserData: UserData = await fetchedUserDataResponse.json();
        
        setUserData(fetchedUserData);
        setProjects(fetchedProjects);
        setDashboardStats(fetchedStats);

      } catch (err: any) {
        console.error("Failed to fetch dashboard data:", err);
        setError(err.message || "Failed to fetch dashboard data.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData(); // Call the renamed function
  }, [currentUser, getIdToken, refreshTrigger]); // Add refreshTrigger to dependencies

  return (
    <div className="min-h-screen flex flex-col">
      <DashboardHeader />

      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          {/* Display loading state or user email */}
          {isLoading && <p>Loading user info...</p>}
          {error && (
            <Alert variant="destructive" className="w-auto">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {userData && <p className="text-sm text-muted-foreground">Logged in as: {userData.email}</p>}
          <CreateProjectButton onCreated={handleRefresh} />
        </div>

         {/* Only show dashboard content if user data is loaded successfully */}
         {!isLoading && !error && userData && (
           <>
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Total Storage</CardTitle>
                  <CardDescription>Across all projects</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="animate-pulse">
                      <div className="h-8 bg-muted rounded w-24"></div>
                      <div className="h-4 bg-muted rounded w-32 mt-2"></div>
                      <div className="h-2 bg-muted mt-2 rounded-full"></div>
                    </div>
                  ) : dashboardStats && (
                    <>
                      <div className="text-2xl font-bold">{formatBytes(dashboardStats.total_storage)}</div>
                      <p className="text-xs text-muted-foreground">
                        of {formatBytes(dashboardStats.total_storage_limit)} ({((dashboardStats.total_storage / dashboardStats.total_storage_limit) * 100).toFixed(2)}%)
                      </p>
                      <div className="h-2 bg-muted mt-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-primary h-full rounded-full" 
                          style={{ width: `${Math.min((dashboardStats.total_storage / dashboardStats.total_storage_limit) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Total Files</CardTitle>
                  <CardDescription>Across all projects</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="animate-pulse">
                      <div className="h-8 bg-muted rounded w-16"></div>
                      <div className="h-4 bg-muted rounded w-32 mt-2"></div>
                    </div>
                  ) : dashboardStats && (
                    <>
                      <div className="text-2xl font-bold">{dashboardStats.total_files.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground">Total uploaded files</p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>API Requests</CardTitle>
                  <CardDescription>Last 30 days</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="animate-pulse">
                      <div className="h-8 bg-muted rounded w-20"></div>
                      <div className="h-4 bg-muted rounded w-32 mt-2"></div>
                    </div>
                  ) : dashboardStats && (
                    <>
                      <div className="text-2xl font-bold">{dashboardStats.total_api_requests.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground">
                        {dashboardStats.api_requests_change > 0 ? '+' : ''}{dashboardStats.api_requests_change.toFixed(1)}% from last month
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Pass fetched projects and refresh handler to ProjectList */}
            <ProjectList
              projects={projects}
              isLoading={isLoading}
              error={error}
              onProjectDeleted={handleRefresh} // Pass the refresh handler
            />
           </>
         )}
         {/* Optionally show a message if loading failed or no user */}
         {!isLoading && (error || !userData) && (
            <p>Could not load dashboard content.</p>
         )}
      </main>
    </div>
  );
}
