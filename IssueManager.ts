import { JiraIssue, JiraSearchResult } from '../types/types';
import { MCPClient } from '../services/MCPClient';
import { UIManager } from '../ui/UIManager';

export class IssueManager {
  private mcpClient: MCPClient;
  private uiManager: UIManager;

  constructor(mcpClient: MCPClient, uiManager: UIManager) {
    this.mcpClient = mcpClient;
    this.uiManager = uiManager;
  }

  // Guided issue creation workflow
  async createIssueGuided(): Promise<void> {
    this.uiManager.showIssueCreationHeader();
    
    const issue: Partial<JiraIssue> = {};
    
    // Collect issue details step by step
    issue.project = await this.uiManager.askQuestion(
      'Which project is this issue for? ', 
      'project'
    );

    issue.issueType = await this.uiManager.askQuestion(
      'What type of issue is this? (Bug, Task, Story, Epic): ', 
      'issueType'
    );

    issue.title = await this.uiManager.askQuestion(
      'What is the issue title/summary? ', 
      'title'
    );

    issue.description = await this.uiManager.askQuestion(
      'Please provide a detailed description: ', 
      'description'
    );

    issue.priority = await this.uiManager.askQuestion(
      'What is the priority? (Low, Medium, High, Critical): ', 
      'priority'
    );

    // Show summary and confirm
    this.uiManager.showIssueSummary(issue);
    const confirmed = await this.uiManager.askConfirmation('Create this issue? (y/n): ');
    
    if (confirmed) {
      await this.createIssue(issue as JiraIssue);
    } else {
      this.uiManager.showWarning('Issue creation cancelled.');
    }
  }

  // Create issue with duplicate checking
  async createIssue(issue: JiraIssue, checkDuplicates: boolean = true): Promise<void> {
    try {
      // Check for similar issues if requested
      if (checkDuplicates) {
        const duplicateCheckResult = await this.checkForDuplicates(issue.title);
        if (!duplicateCheckResult) {
          this.uiManager.showWarning('Issue creation cancelled due to duplicates.');
          return;
        }
      }

      // Show loading animation
      await this.uiManager.showLoadingAnimation('Creating Jira issue');
      
      // Create issue via MCP
      const result = await this.mcpClient.createJiraIssue(issue);
      
      // Show success message
      this.uiManager.showSuccess(
        'Issue created successfully!',
        result.key,
        result.self.replace('/rest/api/3/issue/', '/browse/')
      );
      
    } catch (error) {
      this.uiManager.showError(`Failed to create issue: ${error.message}`);
      
      // Fallback to mock creation for demo purposes
      this.uiManager.showWarning('Falling back to mock creation...');
      await this.uiManager.showLoadingAnimation('Creating mock issue');
      
      this.uiManager.showSuccess(
        'Mock issue created successfully!',
        'DEMO-123',
        'https://demo.atlassian.net/browse/DEMO-123'
      );
    }
  }

  // Check for duplicate issues
  async checkForDuplicates(title: string): Promise<boolean> {
    try {
      this.uiManager.showInfo('🔍 Checking for similar existing issues...');
      
      const similarIssues = await this.mcpClient.searchJiraIssues(title);
      
      if (similarIssues.length > 0) {
        this.uiManager.showSimilarIssues(similarIssues);
        
        const shouldContinue = await this.uiManager.askConfirmation(
          'Do you still want to create a new issue? (yes/no): '
        );
        
        return shouldContinue;
      }
      
      return true; // No duplicates found, proceed
    } catch (error) {
      this.uiManager.showWarning('Could not check for similar issues, proceeding with creation...');
      return true; // Proceed if duplicate check fails
    }
  }

  // Search for issues
  async searchIssues(): Promise<void> {
    this.uiManager.showSearchHeader();
    
    const query = await this.uiManager.askQuestion('Enter search terms: ', 'search');
    
    this.uiManager.showInfo('🔍 Searching Jira issues...');
    
    try {
      const issues = await this.mcpClient.searchJiraIssues(query);
      this.uiManager.showSearchResults(issues);
    } catch (error) {
      this.uiManager.showError(`Search failed: ${error.message}`);
    }
  }

  // Get available projects (for validation)
  async getAvailableProjects(): Promise<any[]> {
    try {
      return await this.mcpClient.getJiraProjects();
    } catch (error) {
      this.uiManager.showWarning(`Could not fetch projects: ${error.message}`);
      return [];
    }
  }

  // Validate issue data
  validateIssue(issue: Partial<JiraIssue>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!issue.project) errors.push('Project is required');
    if (!issue.issueType) errors.push('Issue type is required');
    if (!issue.title) errors.push('Title is required');
    if (!issue.description) errors.push('Description is required');
    if (!issue.priority) errors.push('Priority is required');
    
    // Additional validation
    if (issue.title && issue.title.length < 3) {
      errors.push('Title must be at least 3 characters long');
    }
    
    if (issue.description && issue.description.length < 10) {
      errors.push('Description must be at least 10 characters long');
    }
    
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (issue.priority && !validPriorities.includes(issue.priority.toLowerCase())) {
      errors.push('Priority must be one of: Low, Medium, High, Critical');
    }
    
    const validTypes = ['bug', 'task', 'story', 'epic'];
    if (issue.issueType && !validTypes.includes(issue.issueType.toLowerCase())) {
      errors.push('Issue type must be one of: Bug, Task, Story, Epic');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Auto-complete suggestions for fields
  async getFieldSuggestions(field: string, input: string): Promise<string[]> {
    switch (field.toLowerCase()) {
      case 'project':
        try {
          const projects = await this.mcpClient.getJiraProjects();
          return projects
            .map(p => p.key)
            .filter(key => key.toLowerCase().includes(input.toLowerCase()));
        } catch {
          return [];
        }
      
      case 'issuetype':
        return ['Bug', 'Task', 'Story', 'Epic']
          .filter(type => type.toLowerCase().includes(input.toLowerCase()));
      
      case 'priority':
        return ['Low', 'Medium', 'High', 'Critical']
          .filter(priority => priority.toLowerCase().includes(input.toLowerCase()));
      
      default:
        return [];
    }
  }
}