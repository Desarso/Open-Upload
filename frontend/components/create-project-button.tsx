"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { PlusIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
// import { useRouter } from "next/navigation"; // Remove router for now
import { useAuth } from "@/context/AuthContext"; // Import useAuth
import { createProject, type Project } from "@/lib/apiClient"; // Import API function
import { toast } from "@/components/ui/use-toast"; // Import toast

interface CreateProjectButtonProps {
  onCreated?: (project: Project) => void;
}

export function CreateProjectButton({ onCreated }: CreateProjectButtonProps) {
  const { currentUser, getIdToken } = useAuth(); // Get auth context
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // const router = useRouter(); // Remove router for now

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to create a project." });
      return;
    }
    setIsLoading(true);

    const token = await getIdToken();
    if (!token) {
      toast({ variant: "destructive", title: "Error", description: "Authentication error. Please try again." });
      setIsLoading(false);
      return;
    }

    try {
      const projectData = {
        name: name,
        description: description || undefined, // Send undefined if empty
        user_firebase_uid: currentUser.uid, // Pass the Firebase UID
      };
      const created = await createProject(token, projectData);

      toast({ title: "Success", description: `Project "${name}" created successfully.` });
      setOpen(false); // Close dialog on success
      setName(""); // Reset fields
      setDescription("");
      // Notify parent so it can refresh the list without a full reload.
      onCreated?.(created);
    } catch (err: any) {
      console.error("Failed to create project:", err);
      toast({ variant: "destructive", title: "Error", description: err.message || "Failed to create project." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create a new project</DialogTitle>
            <DialogDescription>Projects help you organize your files and manage access.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                placeholder="My Awesome Project"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="A brief description of your project"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
