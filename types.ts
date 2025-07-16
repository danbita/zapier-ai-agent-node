// Core types for the Jira AI Agent application

export interface JiraIssue {
    project: string;
    issueType: string;
    title: string;
    description: string;
    priority: string;
  }
  
  export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }
  
  export interface ConversationState {
    isCreatingIssue: boolean;
    currentIssue: Partial<JiraIssue>;
    pendingField: string | null;
    awaitingConfirmation: boolean;
  }

  export interface MCPRequest {
    jsonrpc: string;
    id: string;
    method: string;
    params: any;
  }
  
  export interface MCPResponse {
    jsonrpc: string;
    id: string;
    result?: any;
    error?: {
      code: number;
      message: string;
      data?: any;
    };
  }
  
  export interface ZapierMCPClient {
    baseUrl: string;
    apiKey: string;
    httpClient: any; // AxiosInstance
  }
  
  export interface JiraSearchResult {
    key: string;
    self: string;
    fields: {
      summary: string;
      issuetype: { name: string };
      status: { name: string };
      priority?: { name: string };
    };
  }
