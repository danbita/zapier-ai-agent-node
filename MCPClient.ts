import axios, { AxiosInstance } from 'axios';
import { MCPRequest, MCPResponse, JiraIssue, JiraSearchResult, ChatMessage } from '../types/types';

export class MCPClient {
  private baseUrl: string;
  private httpClient: AxiosInstance;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl;
    
    // Create HTTP client with proper headers for MCP
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
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
      // Make request to the full URL (it already includes /mcp)
      const response = await this.httpClient.post(this.baseUrl, request);
      const mcpResponse: MCPResponse = response.data;

      if (mcpResponse.error) {
        throw new Error(`MCP Error: ${mcpResponse.error.message}`);
      }

      return mcpResponse.result;
    } catch (error) {
      if (error.response) {
        // Log more details for debugging
        console.error('MCP Response Error Details:', {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: error.response.data
        });
        throw new Error(`MCP HTTP Error: ${error.response.status} - ${error.response.statusText}`);
      } else if (error.request) {
        throw new Error('MCP Network Error: No response received');
      } else {
        throw new Error(`MCP Error: ${error.message}`);
      }
    }
  }

  // Test connection to MCP server with detailed debugging
  async testConnection(): Promise<boolean> {
    console.log('\n🔍 === MCP CONNECTION DEBUG ===');
    console.log('Base URL:', this.baseUrl);
    console.log('Full endpoint:', this.baseUrl);
    console.log('Request headers:', {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Jira-AI-Agent/1.0.0'
    });
    
    try {
      console.log('Making test request...');
      
      // Try a simple capabilities request first
      const result = await this.callMethod('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'Jira-AI-Agent',
          version: '1.0.0'
        }
      });
      
      console.log('✅ SUCCESS! MCP initialized:', result);
      
      // Now try tools/list
      try {
        const tools = await this.callMethod('tools/list', {});
        console.log('✅ Available tools:', tools);
      } catch (toolsError) {
        console.log('⚠️  Tools list failed, but connection works:', toolsError.message);
      }
      
      return true;
    } catch (error) {
      console.log('❌ FAILED! Error details:');
      console.log('- Error message:', error.message);
      console.log('- Error type:', error.constructor.name);
      
      // Try alternative approaches
      console.log('\n🔄 Trying alternative request formats...');
      
      // Try without initialize
      try {
        console.log('Trying direct tools/list...');
        const directResult = await this.callMethod('tools/list', {});
        console.log('✅ Direct tools/list worked:', directResult);
        return true;
      } catch (directError) {
        console.log('❌ Direct tools/list failed:', directError.message);
      }
      
      // Try simple ping/status
      try {
        console.log('Trying simple status check...');
        const statusResult = await this.callMethod('ping', {});
        console.log('✅ Ping worked:', statusResult);
        return true;
      } catch (pingError) {
        console.log('❌ Ping failed:', pingError.message);
      }
      
      console.log('=================================\n');
      return false;
    }
  }

  // ===== JIRA METHODS VIA MCP =====

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

  // ===== UTILITY METHODS =====

  // Get list of available tools
  async getAvailableTools(): Promise<any[]> {
    try {
      const result = await this.callMethod('tools/list', {});
      return result || [];
    } catch (error) {
      throw new Error(`Could not fetch available tools: ${error.message}`);
    }
  }

  // Test specific tool availability
  async testTool(toolName: string): Promise<boolean> {
    try {
      const tools = await this.getAvailableTools();
      return tools.some(tool => tool.name?.includes(toolName) || tool.includes(toolName));
    } catch (error) {
      console.warn(`Could not test tool ${toolName}:`, error.message);
      return false;
    }
  }
}
