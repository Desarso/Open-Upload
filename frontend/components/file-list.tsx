"use client"

import { useState, useEffect } from "react"
import { FileIcon, DownloadIcon, TrashIcon, ExternalLinkIcon, CopyIcon, SearchIcon, List, Grid, MoreVertical, Image as ImageIcon, FileText, File, Music, Video, Archive } from "lucide-react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faFilePdf, faFileWord, faFileExcel, faFilePowerpoint, faFileCode, faFileImage, faFileVideo, faFileAudio, faFileArchive, faFileCsv, faFileLines } from "@fortawesome/free-solid-svg-icons"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { listFiles, deleteFile, downloadFile, FileInfo, getFileThumbnailUrl } from "@/lib/apiClient"
import { toast } from "@/hooks/use-toast"
import { useAuth } from "@/context/AuthContext"

// Create icon components that accept className prop (for Font Awesome icons)
const createFontAwesomeIcon = (icon: any) => {
  return ({ className }: { className?: string }) => <FontAwesomeIcon icon={icon} className={className} />
}

interface FileListProps {
  projectId: string
  refreshKey?: number
}

interface GridFileItemProps {
  file: FileInfo
  isImage: boolean
  FileTypeIcon: React.ComponentType<{ className?: string }>
  isPdf: boolean
  onView: () => void
  onDownload: () => void
  onCopy: () => void
  onDelete: () => void
  formatFileSize: (bytes: number) => string
  getFileUrl: (fileId: string) => string
  getThumbnailUrl: (fileId: string) => string
  getIdToken: () => Promise<string | null>
}

function GridFileItem({
  file,
  isImage,
  FileTypeIcon,
  isPdf,
  onView,
  onDownload,
  onCopy,
  onDelete,
  formatFileSize,
  getFileUrl,
  getThumbnailUrl,
  getIdToken,
}: GridFileItemProps) {
  const [imageError, setImageError] = useState(false)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [loadingThumbnail, setLoadingThumbnail] = useState(false)

  useEffect(() => {
    if (isImage && !imageError) {
      setLoadingThumbnail(true)
      // Thumbnail endpoint is public, no auth needed
      const url = getThumbnailUrl(file.id)
      setThumbnailUrl(url)
      setLoadingThumbnail(false)
    }
  }, [isImage, file.id, imageError, getThumbnailUrl])

  return (
    <div
      className="group relative flex flex-col rounded-lg border overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={onView}
    >
      {/* Thumbnail/Icon */}
      <div className="relative h-[120px] bg-muted flex items-center justify-center overflow-hidden">
        {isImage && !imageError ? (
          loadingThumbnail ? (
            <div className="w-full h-full animate-pulse bg-muted" />
          ) : (
            <img
              src={thumbnailUrl || getFileUrl(file.id)}
              alt={file.filename}
              className="h-[120px] w-auto object-contain"
              style={{ maxWidth: '100%' }}
              onError={() => setImageError(true)}
            />
          )
        ) : (
          <FileTypeIcon className={`h-12 w-12 ${isPdf ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`} />
        )}
      </div>
      
      {/* File info */}
      <div className="p-3 space-y-1">
        <p className="text-xs font-medium truncate" title={file.filename}>
          {file.filename}
        </p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatFileSize(file.size)}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                }}
              >
                <MoreVertical className="h-3 w-3" />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={onView}>
                <ExternalLinkIcon className="h-4 w-4 mr-2" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDownload}>
                <DownloadIcon className="h-4 w-4 mr-2" />
                Download
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopy}>
                <CopyIcon className="h-4 w-4 mr-2" />
                Copy URL
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <TrashIcon className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

type ViewMode = "list" | "grid"

const VIEW_MODE_STORAGE_KEY = "file-list-view-mode"

export function FileList({ projectId, refreshKey = 0 }: FileListProps) {
  const { getIdToken } = useAuth()
  const [files, setFiles] = useState<FileInfo[]>([])
  const [filteredFiles, setFilteredFiles] = useState<FileInfo[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  
  // Load view mode from localStorage, default to "list"
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
      if (saved === "list" || saved === "grid") {
        return saved as ViewMode
      }
    }
    return "list"
  })

  // Save view mode to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode)
    }
  }, [viewMode])

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        setIsLoading(true)
        const token = await getIdToken()
        if (!token) {
          throw new Error("No authentication token available")
        }
        const fileList = await listFiles(token, parseInt(projectId))
        setFiles(fileList ?? [])
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
  }, [projectId, getIdToken, refreshKey])

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

  const handleDelete = async (fileId: string) => {
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

  const handleDownload = async (fileId: string, filename: string) => {
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

  const copyToClipboard = (fileId: string, filename: string) => {
    const url = getFileUrl(fileId)
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

  const isImageFile = (mimeType: string): boolean => {
    return mimeType.startsWith("image/")
  }

  const getFileExtension = (filename: string): string => {
    const lastDot = filename.lastIndexOf('.')
    if (lastDot === -1 || lastDot === filename.length - 1) return ''
    return filename.substring(lastDot + 1).toLowerCase()
  }

  const isCodeFile = (extension: string, mimeType: string): boolean => {
    const codeExtensions = [
      'js', 'jsx', 'ts', 'tsx', 'json', 'xml', 'html', 'htm', 'css', 'scss', 'sass', 'less',
      'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'sh', 'bash',
      'yaml', 'yml', 'md', 'sql', 'r', 'm', 'mm', 'h', 'hpp', 'cc', 'cxx', 'vue', 'svelte',
      'dart', 'lua', 'pl', 'pm', 'rkt', 'clj', 'cljs', 'hs', 'elm', 'ex', 'exs', 'erl', 'hrl',
      'scala', 'groovy', 'kt', 'kts', 'gradle', 'makefile', 'cmake', 'dockerfile', 'tf', 'hcl'
    ]
    const codeMimeTypes = [
      'application/json', 'text/javascript', 'text/typescript', 'application/xml', 'text/xml',
      'text/html', 'text/css', 'application/x-sh', 'text/x-python', 'text/x-java',
      'text/x-c', 'text/x-c++', 'application/x-php', 'text/x-ruby', 'text/x-go',
      'application/x-yaml', 'text/markdown', 'application/sql'
    ]
    return codeExtensions.includes(extension) || codeMimeTypes.some(type => mimeType.includes(type))
  }

  const isTextFile = (extension: string, mimeType: string): boolean => {
    const textExtensions = ['txt', 'log', 'readme', 'license', 'changelog', 'authors', 'contributors']
    return textExtensions.includes(extension) || (mimeType.startsWith('text/') && !mimeType.includes('csv') && !mimeType.includes('html') && !mimeType.includes('css') && !mimeType.includes('javascript') && !mimeType.includes('xml'))
  }

  const getFileIcon = (mimeType: string, filename: string) => {
    const extension = getFileExtension(filename)
    
    // Category-based checks first
    if (mimeType.startsWith("image/")) return createFontAwesomeIcon(faFileImage)
    if (mimeType.startsWith("video/")) return createFontAwesomeIcon(faFileVideo)
    if (mimeType.startsWith("audio/")) return createFontAwesomeIcon(faFileAudio)
    
    // Code files category
    if (isCodeFile(extension, mimeType)) return createFontAwesomeIcon(faFileCode)
    
    // Text files category
    if (isTextFile(extension, mimeType)) return createFontAwesomeIcon(faFileLines)
    
    // Specific document types
    const specificExtensions: Record<string, any> = {
      'pdf': faFilePdf,
      'doc': faFileWord,
      'docx': faFileWord,
      'xls': faFileExcel,
      'xlsx': faFileExcel,
      'ppt': faFilePowerpoint,
      'pptx': faFilePowerpoint,
      'csv': faFileCsv,
      'zip': faFileArchive,
      'rar': faFileArchive,
      '7z': faFileArchive,
      'tar': faFileArchive,
      'gz': faFileArchive,
      'bz2': faFileArchive,
    }
    
    if (specificExtensions[extension]) {
      return createFontAwesomeIcon(specificExtensions[extension])
    }
    
    // Fallback to mime type checking for specific types
    if (mimeType.includes("pdf")) return createFontAwesomeIcon(faFilePdf)
    if (mimeType.includes("word") || (mimeType.includes("document") && mimeType.includes("word"))) return createFontAwesomeIcon(faFileWord)
    if (mimeType.includes("excel") || mimeType.includes("spreadsheet") || mimeType.includes("ms-excel")) return createFontAwesomeIcon(faFileExcel)
    if (mimeType.includes("csv") || mimeType.includes("text/csv")) return createFontAwesomeIcon(faFileCsv)
    if (mimeType.includes("powerpoint") || mimeType.includes("presentation") || mimeType.includes("ms-powerpoint")) return createFontAwesomeIcon(faFilePowerpoint)
    if (mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("compressed")) return createFontAwesomeIcon(faFileArchive)
    
    // Generic fallback
    return File
  }

  const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  // Always use backend public route - never construct MinIO URLs directly
  // The backend route /files/:file_id handles MinIO access server-side
  const getFileUrl = (fileId: string) => {
    return `${API_BASE_URL}/files/${fileId}`
  }

  // Get thumbnail URL - uses public thumbnail endpoint (no auth required)
  const getThumbnailUrl = (fileId: string): string => {
    return getFileThumbnailUrl(fileId)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>Files</CardTitle>
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <ToggleGroup type="single" value={viewMode} onValueChange={(value) => value && setViewMode(value as ViewMode)}>
            <ToggleGroupItem value="list" aria-label="List view">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="grid" aria-label="Grid view">
              <Grid className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
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
        ) : viewMode === "list" ? (
          <div className="space-y-2">
            {filteredFiles.map((file) => {
              const FileTypeIcon = getFileIcon(file.mime_type, file.filename)
              const isPdf = file.mime_type.includes("pdf") || getFileExtension(file.filename) === "pdf"
              
              return (
                <div key={file.id} className="flex items-center space-x-4 rounded-lg border p-3">
                  <div className={`rounded-full p-2 ${isPdf ? 'bg-red-100 dark:bg-red-900/20' : 'bg-primary/10'}`}>
                    <FileTypeIcon className={`h-5 w-5 ${isPdf ? 'text-red-600 dark:text-red-400' : 'text-primary'}`} />
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
                    onClick={() => window.open(getFileUrl(file.id), '_blank')}
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
              )
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredFiles.map((file) => {
              const FileTypeIcon = getFileIcon(file.mime_type, file.filename)
              const isImage = isImageFile(file.mime_type)
              const isPdf = file.mime_type.includes("pdf") || getFileExtension(file.filename) === "pdf"
              
              return (
                <GridFileItem
                  key={file.id}
                  file={file}
                  isImage={isImage}
                  FileTypeIcon={FileTypeIcon}
                  isPdf={isPdf}
                  onView={() => window.open(getFileUrl(file.id), '_blank')}
                  onDownload={() => handleDownload(file.id, file.filename)}
                  onCopy={() => copyToClipboard(file.id, file.filename)}
                  onDelete={() => handleDelete(file.id)}
                  formatFileSize={formatFileSize}
                  getFileUrl={getFileUrl}
                  getThumbnailUrl={getThumbnailUrl}
                  getIdToken={getIdToken}
                />
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
