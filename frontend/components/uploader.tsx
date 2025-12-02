"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Upload, X, FileIcon, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { uploadFile } from "@/lib/apiClient"
import { useAuth } from "@/context/AuthContext"

type FileStatus = "idle" | "uploading" | "success" | "error"

interface FileWithStatus {
  file: File
  id: string
  progress: number
  status: FileStatus
  error?: string
}

interface UploaderProps {
  projectId: string
  onUploadComplete?: () => void
}

export function Uploader({ projectId, onUploadComplete }: UploaderProps) {
  const { getIdToken } = useAuth()
  const [files, setFiles] = useState<FileWithStatus[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return

    const newFiles = Array.from(selectedFiles).map((file) => ({
      file,
      id: crypto.randomUUID(),
      progress: 0,
      status: "idle" as FileStatus,
    }))

    setFiles((prev) => [...prev, ...newFiles])

    // Start uploading each file
    newFiles.forEach((fileWithStatus) => {
      handleUpload(fileWithStatus)
    })
  }

  const handleUpload = async (fileWithStatus: FileWithStatus) => {
    const { id, file } = fileWithStatus

    // Update status to uploading
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, status: "uploading" } : f)))

    try {
      const token = await getIdToken()
      if (!token) {
        throw new Error("No authentication token available")
      }

      // Set initial progress
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, progress: 10 } : f))
      )

      // Upload the file
      const result = await uploadFile(token, parseInt(projectId), file)

      // Update with success
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, progress: 100, status: "success" } : f)))

      // Notify parent so it can refresh any dependent data (e.g., file list)
      onUploadComplete?.()

      // Remove successful upload after 3 seconds
      setTimeout(() => {
        setFiles((prev) => prev.filter((f) => f.id !== id))
      }, 3000)
    } catch (error) {
      // Update with error
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                status: "error",
                error: error instanceof Error ? error.message : "Upload failed",
              }
            : f,
        ),
      )
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileChange(e.dataTransfer.files)
  }

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  return (
    <div className="w-full space-y-4">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center ${
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="rounded-full bg-primary/10 p-3">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">Drag files here or click to upload</h3>
            <p className="text-sm text-muted-foreground">Upload any file up to 16MB</p>
          </div>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            Select Files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files)}
          />
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map(({ id, file, progress, status, error }) => (
            <div key={id} className="flex items-center space-x-4 rounded-lg border p-3">
              <div className="rounded-full bg-primary/10 p-2">
                <FileIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                {status === "uploading" && <Progress value={progress} className="h-1 mt-2" />}
                {status === "error" && <p className="text-xs text-destructive mt-1">{error}</p>}
              </div>
              {status === "success" ? (
                <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
              ) : status === "error" ? (
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
              ) : (
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => removeFile(id)}>
                  <X className="h-4 w-4" />
                  <span className="sr-only">Remove file</span>
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
