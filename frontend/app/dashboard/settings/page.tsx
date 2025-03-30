"use client";

import { useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SettingsPage() {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [uploadNotifications, setUploadNotifications] = useState(true);
  const [defaultVisibility, setDefaultVisibility] = useState("private");
  const [autoDelete, setAutoDelete] = useState("never");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // In a real application, you would save these settings to a database
    console.log("Settings saved:", {
      emailNotifications,
      uploadNotifications,
      defaultVisibility,
      autoDelete
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <DashboardHeader />

      <main className="flex-1 container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-8">Settings</h1>

        <div className="grid gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Configure how you want to receive notifications</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-notifications">Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive email notifications about your uploads
                    </p>
                  </div>
                  <Switch
                    id="email-notifications"
                    checked={emailNotifications}
                    onCheckedChange={setEmailNotifications}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="upload-notifications">Upload Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when uploads complete or fail
                    </p>
                  </div>
                  <Switch
                    id="upload-notifications"
                    checked={uploadNotifications}
                    onCheckedChange={setUploadNotifications}
                  />
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upload Preferences</CardTitle>
              <CardDescription>Customize your default upload settings</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="visibility">Default File Visibility</Label>
                  <Select value={defaultVisibility} onValueChange={setDefaultVisibility}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select visibility" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="unlisted">Unlisted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auto-delete">Auto-Delete Files</Label>
                  <Select value={autoDelete} onValueChange={setAutoDelete}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Never</SelectItem>
                      <SelectItem value="1day">After 24 hours</SelectItem>
                      <SelectItem value="1week">After 1 week</SelectItem>
                      <SelectItem value="1month">After 1 month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit">Save Settings</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
