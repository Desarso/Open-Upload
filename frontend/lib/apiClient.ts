// apiClient.ts
// Functions for interacting with the backend API from the client-side

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// Define interfaces for expected data structures (matching backend models)
// These help with type safety in the frontend
export interface Project {
  id: number;
  name: string;
  description?: string | null;
  created_at: string; // ISO date string
  user_firebase_uid: string;
}

export interface ApiKey {
  id: number;
  key: string;
  is_active: boolean;
  created_at: string; // ISO date string
  last_used_at?: string | null; // ISO date string
  user_firebase_uid: string;
  project_id: number;
}

export interface UsageStats {
  date: string;
  api_calls: number;
  avg_response_time: number;
  success_rate: number;
}

export interface DashboardStats {
  total_storage: number;
  total_storage_limit: number;
  total_files: number;
  total_api_requests: number;
  api_requests_change: number;
}

export interface ProjectStats {
  total_storage: number;
  total_files: number;
}

export interface ProjectWithKeys extends Project {
    api_keys: ApiKey[];
}

// Helper function to handle fetch requests
async function fetchApi(
  endpoint: string,
  token: string | null,
  options: RequestInit = {}
): Promise<any> {
  if (!token) {
    throw new Error("Authentication token is required.");
  }

  const url = `${API_BASE_URL}${endpoint}`;
  let headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
  };
  
  // Only add Content-Type: application/json if not a FormData request
  if (!(options.body instanceof FormData)) {
    headers = {
      ...headers,
      'Content-Type': 'application/json',
    };
  }

  // Merge with any additional headers from options
  headers = {
    ...headers,
    ...options.headers as Record<string, string>,
  };

  console.log(`Fetching: ${options.method || 'GET'} ${url}`); // Log API calls

  try {
    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      let errorDetail = `HTTP error! status: ${response.status}`;
      try {
        // Try to parse error message from backend response body
        const errorData = await response.json();
        errorDetail += ` - ${errorData.detail || JSON.stringify(errorData)}`;
      } catch (e) {
        // If parsing fails, use status text
        errorDetail += ` - ${response.statusText}`;
      }
      console.error("API Error:", errorDetail);
      throw new Error(errorDetail);
    }

    // Handle 204 No Content response (e.g., for DELETE)
    if (response.status === 204) {
        console.log(`Success: ${options.method || 'GET'} ${url} (No Content)`);
        return null; // Or return { success: true } if preferred
    }

    const data = await response.json();
    console.log(`Success: ${options.method || 'GET'} ${url}`, data);
    return data;

  } catch (error) {
    console.error(`API request failed: ${options.method || 'GET'} ${url}`, error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

// --- Project API Functions ---

export const getProjects = (token: string): Promise<Project[]> => {
  return fetchApi('/projects/', token, { method: 'GET' });
};

export const createProject = (token: string, projectData: { name: string; description?: string; user_firebase_uid: string }): Promise<Project> => {
  return fetchApi('/projects/', token, {
    method: 'POST',
    body: JSON.stringify(projectData),
  });
};

export const getProject = (token: string, projectId: number): Promise<ProjectWithKeys> => {
  return fetchApi(`/projects/${projectId}`, token, { method: 'GET' });
};

export const getProjectStats = (token: string, projectId: number): Promise<ProjectStats> => {
  return fetchApi(`/projects/${projectId}/stats`, token, { method: 'GET' });
};

export const deleteProject = (token: string, projectId: number): Promise<null> => {
  return fetchApi(`/projects/${projectId}`, token, { method: 'DELETE' });
};

// --- API Key API Functions ---

export const getApiKeys = (token: string, projectId?: number): Promise<ApiKey[]> => {
  const endpoint = projectId ? `/api-keys/?project_id=${projectId}` : '/api-keys/';
  return fetchApi(endpoint, token, { method: 'GET' });
};

export const createApiKey = (token: string, apiKeyData: { project_id: number }): Promise<ApiKey> => {
  return fetchApi('/api-keys/', token, {
    method: 'POST',
    body: JSON.stringify(apiKeyData),
  });
};

export const deleteApiKey = (token: string, apiKeyId: number): Promise<null> => {
  return fetchApi(`/api-keys/${apiKeyId}`, token, { method: 'DELETE' });
};

// --- File API Functions ---

export interface FileInfo {
  id: number;
  filename: string;
  size: number;
  mime_type: string;
  storage_path: string;
  project_id: number;
  created_at: string;
  user_firebase_uid: string;
}

export const uploadFile = async (token: string, projectId: number, file: File): Promise<FileInfo> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('project_id', projectId.toString());

  return fetchApi('/frontend/files/upload', token, {
    method: 'POST',
    headers: {
      // Remove Content-Type to let browser set it with boundary
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });
};

export const listFiles = (token: string, projectId: number): Promise<FileInfo[]> => {
  return fetchApi(`/frontend/files/list?project_id=${projectId}`, token, { method: 'GET' });
};

export const downloadFile = async (token: string, fileId: number): Promise<Blob> => {
  const url = `${API_BASE_URL}/files/${fileId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.blob();
};

export const deleteFile = (token: string, fileId: number): Promise<null> => {
  return fetchApi(`/frontend/files/${fileId}`, token, { method: 'DELETE' });
};

// --- Usage API Functions ---

export const getDashboardStats = (token: string): Promise<DashboardStats> => {
  return fetchApi('/usage/dashboard-stats', token, { method: 'GET' });
};

// --- Documentation API Functions ---

export const getOpenApiDocs = async (): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/openapi.json`);
  if (!response.ok) {
    throw new Error('Failed to fetch OpenAPI documentation');
  }
  return response.json();
};

export const getUsageStats = (
  token: string,
  params: {
    start_date?: string;
    end_date?: string;
    project_id?: number;
  } = {}
): Promise<UsageStats[]> => {
  const queryParams = new URLSearchParams();
  if (params.start_date) queryParams.append('start_date', params.start_date);
  if (params.end_date) queryParams.append('end_date', params.end_date);
  if (params.project_id) queryParams.append('project_id', params.project_id.toString());
  
  const endpoint = `/usage/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  return fetchApi(endpoint, token, { method: 'GET' });
};
