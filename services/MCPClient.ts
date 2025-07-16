import axios, { AxiosInstance } from 'axios';
import { MCPRequest, MCPResponse, JiraIssue, JiraSearchResult } from '../types/types';

export class MCPClient {
  private baseUrl: string;
  private apiKey: string;
  private httpClient: AxiosInstance;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Jira-AI-Agent/1.0.0'
      }
    });
  }

  // Generic MCP method call wrapper
  async callMethod(method: string, params: any): Promise<any> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: Date.now().toString(),
      method: method,
      params: params
    };

    try {
      const response = await this.httpClient.post(`${this.baseUrl}/mcp`, request);
      const mcpResponse: MCPResponse = response.data;

      if (mcpResponse.error) {
        throw new Error(`MCP Error: ${mcpResponse.error.message}`);
      }

      return mcpResponse.result;
    } catch (error) {
      if (error.response) {
        throw new Error(`MCP HTTP Error: ${error.response.status} - ${error.response.statusText}`);
      } else if (error.request) {
        throw new Error('MCP Network Error: No response received');
      } else {
        throw new Error(`MCP Error: ${error.message}`);
      }
    }
  }

  // Test connection to MCP server
  async testConnection(): Promise<boolean> {
    try {
      await this.callMethod('tools/list', {});
      return true;
    } catch (error) {
      console.error('MCP connection test failed:', error.message);
      return false;
    }
  }

  // Create Jira issue via MCP
  async createJiraIssue(issue: JiraIssue): Promise<any> {
    const issueData = {
      fields: {
        project: {
          key: issue.project
        },
        summary: issue.title,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: issue.description
                }
              ]
            }
          ]
        },
        issuetype: {
          name: issue.issueType
        },
        priority: {
          name: issue.priority
        }
      }
    };

    try {
      const result = await this.callMethod('tools/jira_software_cloud/create_issue', issueData);
      return result;
    } catch (error) {
      throw new Error(`Failed to create Jira issue: ${error.message}`);
    }
  }

  // Search for existing Jira issues
  async searchJiraIssues(query: string, maxResults: number = 5): Promise<JiraSearchResult[]> {
    try {
      const result = await this.callMethod('tools/jira_software_cloud/search_issues', {
        jql: `text ~ "${query}"`,
        maxResults: maxResults
      });
      
      return result.issues || [];
    } catch (error) {
      throw new Error(`Issue search failed: ${error.message}`);
    }
  }

  // Get available Jira projects
  async getJiraProjects(): Promise<any[]> {
    try {
      const result = await this.callMethod('tools/jira_software_cloud/get_projects', {});
      return result.values || result || [];
    } catch (error) {
      throw new Error(`Could not fetch projects: ${error.message}`);
    }
  }

  // Get Jira issue types for a project
  async getIssueTypes(projectKey: string): Promise<any[]> {
    try {
      const result = await this.callMethod('tools/jira_software_cloud/get_issue_types', {
        projectKey: projectKey
      });
      return result || [];
    } catch (error) {
      throw new Error(`Could not fetch issue types: ${error.message}`);
    }
  }

  // Get issue priorities
  async getPriorities(): Promise<any[]> {
    try {
      const result = await this.callMethod('tools/jira_software_cloud/get_priorities', {});
      return result || [];
    } catch (error) {
      throw new Error(`Could not fetch priorities: ${error.message}`);
    }
  }
}