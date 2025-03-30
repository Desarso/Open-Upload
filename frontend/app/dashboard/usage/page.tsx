"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { DashboardHeader } from "@/components/dashboard-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { UsageStats, getUsageStats, ApiUsageRead, getUsageDetails, Project, getProjects } from "@/lib/apiClient";

export default function UsagePage() {
  const { currentUser, getIdToken } = useAuth();
  const [usageData, setUsageData] = useState<UsageStats[]>([]);
  const [detailedData, setDetailedData] = useState<ApiUsageRead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [projects, setProjects] = useState<Project[]>([]);
  const itemsPerPage = 20;
  const observer = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const [dateRange, setDateRange] = useState<{
    start: string;
    end: string;
  }>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30); // Last 30 days by default
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  });

  const fetchDetailedData = useCallback(async (cursor?: string) => {
    if (!currentUser) return;

    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error("Authentication token not available");
      }

      const response = await getUsageDetails(token, {
        start_date: dateRange.start,
        end_date: dateRange.end,
        project_id: selectedProject !== "all" ? parseInt(selectedProject) : undefined,
        cursor,
        limit: itemsPerPage,
      });

      console.log("Usage details response:", response); // Debug log

      // Handle empty response
      if (!response) {
        console.log("Empty response received");
        setDetailedData([]);
        setHasMore(false);
        return;
      }

      // Handle response as array (direct response from backend)
      if (Array.isArray(response)) {
        if (cursor) {
          setDetailedData(prev => [...prev, ...response]);
        } else {
          setDetailedData(response);
        }
        setHasMore(response.length === itemsPerPage);
        return;
      }

      // Handle response as UsageDetailsResponse (if backend changes to support pagination)
      if (response.items) {
        if (cursor) {
          setDetailedData(prev => [...prev, ...response.items]);
        } else {
          setDetailedData(response.items);
        }
        setHasMore(response.has_more || false);
        setNextCursor(response.next_cursor);
      } else {
        setDetailedData([]);
        setHasMore(false);
      }
    } catch (error: any) {
      console.error("Failed to fetch usage data:", error);
      setError(error.message || "Failed to fetch usage data.");
      if (!cursor) {
        setDetailedData([]); // Only clear data on initial load error
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [currentUser, getIdToken, dateRange, selectedProject]);

  const fetchUsageStats = useCallback(async () => {
    if (!currentUser) return;

    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error("Authentication token not available");
      }

      const stats = await getUsageStats(token, {
        start_date: dateRange.start,
        end_date: dateRange.end,
        project_id: selectedProject !== "all" ? parseInt(selectedProject) : undefined,
      });
      setUsageData(stats || []);
    } catch (error: any) {
      console.error("Failed to fetch usage stats:", error);
      setError(error.message || "Failed to fetch usage stats.");
      setUsageData([]); // Set empty array on error
    }
  }, [currentUser, getIdToken, dateRange, selectedProject]);

  useEffect(() => {
    const fetchProjects = async () => {
      if (!currentUser) return;
      
      try {
        const token = await getIdToken();
        if (!token) return;
        
        const projectsData = await getProjects(token);
        setProjects(projectsData);
      } catch (error) {
        console.error("Failed to fetch projects:", error);
      }
    };

    fetchProjects();
  }, [currentUser, getIdToken]);

  useEffect(() => {
    setIsLoading(true);
    setDetailedData([]);
    setNextCursor(undefined);
    setHasMore(true);
    Promise.all([
      fetchUsageStats(),
      fetchDetailedData(undefined)
    ]).finally(() => {
      setIsLoading(false);
    });
  }, [currentUser, getIdToken, dateRange, selectedProject, fetchUsageStats]);

  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '20px',
      threshold: 0.1,
    };

    observer.current = new IntersectionObserver((entries) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore && !isLoadingMore) {
        setIsLoadingMore(true);
        fetchDetailedData(nextCursor);
      }
    }, options);

    if (loadMoreRef.current) {
      observer.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observer.current) {
        observer.current.disconnect();
      }
    };
  }, [hasMore, isLoadingMore, nextCursor, fetchDetailedData]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  };

  const getStatusColor = (statusCode: number) => {
    if (statusCode < 400) return "text-green-500";
    if (statusCode < 500) return "text-yellow-500";
    return "text-red-500";
  };

  const chartData = usageData?.map((item) => ({
    name: item.date,
    'API Calls': item.api_calls,
    'Response Time (ms)': item.avg_response_time,
    'Success Rate (%)': item.success_rate,
  })) || [];

  return (
    <div className="min-h-screen flex flex-col">
      <DashboardHeader />

      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Usage</h1>
          
          <div className="flex items-center gap-4">
            <div>
              <Label htmlFor="start-date">Start Date</Label>
              <DatePicker
                id="start-date"
                value={new Date(dateRange.start)}
              onChange={(date: Date) =>
                setDateRange((prev) => ({
                  ...prev,
                  start: date.toISOString().split('T')[0],
                }))
              }
              />
            </div>
            <div>
              <Label htmlFor="end-date">End Date</Label>
              <DatePicker
                id="end-date"
                value={new Date(dateRange.end)}
              onChange={(date: Date) =>
                setDateRange((prev) => ({
                  ...prev,
                  end: date.toISOString().split('T')[0],
                }))
              }
              />
            </div>
          </div>
        </div>

        {isLoading && <p>Loading usage data...</p>}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!isLoading && !error && (
          <>
            <div className="flex gap-4 mb-8">
              <Card className="flex-1">
                <CardHeader>
                  <CardTitle>Total API Calls</CardTitle>
                  <CardDescription>Total calls in selected period</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold">
                    {(usageData || []).reduce((sum, item) => sum + item.api_calls, 0).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card className="flex-1">
                <CardHeader>
                  <CardTitle>Average Response Time</CardTitle>
                  <CardDescription>In milliseconds</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold">
                    {((usageData || []).reduce((sum, item) => sum + item.avg_response_time, 0) / (usageData?.length || 1)).toFixed(2)}
                  </p>
                </CardContent>
              </Card>
              <Card className="flex-1">
                <CardHeader>
                  <CardTitle>Success Rate</CardTitle>
                  <CardDescription>Percentage of successful calls</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold">
                    {((usageData || []).reduce((sum, item) => sum + item.success_rate, 0) / (usageData?.length || 1)).toFixed(2)}%
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>API Usage Over Time</CardTitle>
                <CardDescription>
                  API calls, response times, and success rates for the selected period
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{
                  'API Calls': { label: "API Calls" },
                  'Response Time (ms)': { label: "Response Time (ms)" },
                  'Success Rate (%)': { label: "Success Rate (%)" }
                }}>
                  <ComposedChart data={chartData}>
                    <XAxis dataKey="name" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar dataKey="API Calls" fill="#8884d8" yAxisId="left" />
                    <Line type="monotone" dataKey="Response Time (ms)" stroke="#82ca9d" yAxisId="right" />
                    <Line type="monotone" dataKey="Success Rate (%)" stroke="#ffc658" yAxisId="right" />
                  </ComposedChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="mt-8">
              <CardHeader>
                <CardTitle>Detailed Request History</CardTitle>
                <CardDescription>
                  Individual API requests with timestamps and response times
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-4">
                  <Select
                    value={selectedProject}
                    onValueChange={setSelectedProject}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id.toString()}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Endpoint</TableHead>
                        <TableHead>Response Time</TableHead>
                        <TableHead>Status Code</TableHead>
                        <TableHead>Project ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailedData.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>{formatTimestamp(request.timestamp)}</TableCell>
                          <TableCell>{request.endpoint}</TableCell>
                          <TableCell>{(request.response_time || 0).toFixed(2)}ms</TableCell>
                          <TableCell className={getStatusColor(request.status_code)}>
                            {request.status_code}
                          </TableCell>
                          <TableCell>{request.project_id}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div ref={loadMoreRef} className="flex justify-center py-4">
                  {isLoadingMore && (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading more...</span>
                    </div>
                  )}
                  {!hasMore && detailedData.length > 0 && (
                    <span className="text-muted-foreground">No more requests to load</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
