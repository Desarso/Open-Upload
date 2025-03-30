"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { DashboardHeader } from "@/components/dashboard-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
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
import { UsageStats, getUsageStats } from "@/lib/apiClient";

export default function UsagePage() {
  const { currentUser, getIdToken } = useAuth();
  const [usageData, setUsageData] = useState<UsageStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error("Authentication token not available");
        }

        const data = await getUsageStats(token, {
          start_date: dateRange.start,
          end_date: dateRange.end,
        });
        setUsageData(data);
      } catch (error: any) {
        console.error("Failed to fetch usage data:", error);
        setError(error.message || "Failed to fetch usage data.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [currentUser, getIdToken, dateRange]);

  const chartData = usageData.map((item) => ({
    name: item.date,
    'API Calls': item.api_calls,
    'Response Time (ms)': item.avg_response_time,
    'Success Rate (%)': item.success_rate,
  }));

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
                    {usageData.reduce((sum, item) => sum + item.api_calls, 0).toLocaleString()}
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
                    {(usageData.reduce((sum, item) => sum + item.avg_response_time, 0) / usageData.length || 0).toFixed(2)}
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
                    {(usageData.reduce((sum, item) => sum + item.success_rate, 0) / usageData.length || 0).toFixed(2)}%
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
          </>
        )}
      </main>
    </div>
  );
}
