"use client"

import { useState, useEffect } from "react"
import { FileIcon, DownloadIcon, TrashIcon, ExternalLinkIcon, CopyIcon, SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { listFiles, deleteFile, downloadFile, FileInfo } from "@/lib/apiClient"
import { toast } from "@/hooks/use-toast"
import { useAuth } from "@/context/AuthContext"

interface FileListProps {
  projectId: string
}

export function FileList({ projectId }: FileListProps) {
  const { getIdToken } = useAuth()
  const [files, setFiles] = useState<FileInfo[]>([])
  const [filteredFiles, setFilteredFiles] = useState<FileInfo[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        setIsLoading(true)
        const token = await getIdToken()
        if (!token) {
          throw new Error("No authentication token available")
        }
        const fileList = await listFiles(token, parseInt(projectId))
        setFiles(fileList)
      } catch (error) {
        console.error("Failed to fetch files:", error)
        toast({
          title: "Error",
          description: "Failed to load files. Please try again.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    if (projectId) {
      fetchFiles()
    }
  }, [projectId, getIdToken])

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredFiles(files)
    } else {
      const query = searchQuery.toLowerCase()
      setFilteredFiles(
        files.filter((file) => 
          file.filename.toLowerCase().includes(query) || 
          file.mime_type.toLowerCase().includes(query)
        ),
      )
    }
  }, [searchQuery, files])

  const handleDelete = async (fileId: number) => {
    try {
      const token = await getIdToken()
      if (!token) {
        throw new Error("No authentication token available")
      }
      await deleteFile(token, fileId)
      setFiles(files.filter((file) => file.id !== fileId))
      toast({
        title: "File deleted",
        description: "The file has been permanently deleted.",
      })
    } catch (error) {
      console.error("Failed to delete file:", error)
      toast({
        title: "Error",
        description: "Failed to delete file. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleDownload = async (fileId: number, filename: string) => {
    try {
      const token = await getIdToken()
      if (!token) {
        throw new Error("No authentication token available")
      }
      const blob = await downloadFile(token, fileId)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error("Failed to download file:", error)
      toast({
        title: "Error",
        description: "Failed to download file. Please try again.",
        variant: "destructive",
      })
    }
  }

  const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  const copyToClipboard = (fileId: number, filename: string) => {
    const url = `${API_BASE_URL}/files/${fileId}`
    navigator.clipboard.writeText(url)
    toast({
      title: "URL copied",
      description: `The URL for ${filename} has been copied to your clipboard.`,
    })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B"
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    else return (bytes / 1024 / 1024).toFixed(1) + " MB"
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Files</CardTitle>
        <div className="relative w-full max-w-sm">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center space-x-4 rounded-lg border p-3 animate-pulse">
                <div className="rounded-full bg-muted h-10 w-10"></div>
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/4"></div>
                </div>
                <div className="flex space-x-2">
                  <div className="h-8 w-8 bg-muted rounded"></div>
                  <div className="h-8 w-8 bg-muted rounded"></div>
                  <div className="h-8 w-8 bg-muted rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            {searchQuery ? "No files match your search" : "No files uploaded yet"}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFiles.map((file) => (
              <div key={file.id} className="flex items-center space-x-4 rounded-lg border p-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <FileIcon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.filename}</p>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <span>{formatFileSize(file.size)}</span>
                    <span className="mx-1">•</span>
                    <span>{formatDate(file.created_at)}</span>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => copyToClipboard(file.id, file.filename)}
                  >
                    <CopyIcon className="h-4 w-4" />
                    <span className="sr-only">Copy URL</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDownload(file.id, file.filename)}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    <span className="sr-only">Download</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => window.open(`${API_BASE_URL}/files/${file.id}`, '_blank')}
                  >
                    <ExternalLinkIcon className="h-4 w-4" />
                    <span className="sr-only">View</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(file.id)}
                  >
                    <TrashIcon className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
