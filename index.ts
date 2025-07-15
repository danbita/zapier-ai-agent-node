// index.ts - Complete Jira AI Agent with All Features
import { OpenAI } from 'openai';
import * as terminal from 'terminal-kit';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { CLIUtils, EnhancedIssueFlow } from './utils/cli-utils';
import { ErrorHandler, APIWrapper } from './utils/error-handler';
import { DuplicateDetectionService } from './features/duplicate-detection';
import { QuickTester } from './test-runner';

dotenv.config();

interface JiraIssue {
  project: string;
  issueType: string;
  title: string;
  description: string;
  priority: string;
  assignee?: string | null;
}

interface MCPResponse {
  success: boolean;
  data?: any;
  error?: string;
}

interface JiraProject {
  key: string;
  name: string;
}

interface JiraIssueType {
  name: string;
  id: string;
}

interface JiraSearchResponse {
  issues: Array<{
    key: string;
    fields: {
      summary: string;
      status: { name: string };
      priority?: { name: string };
    };
  }>;
}

interface ProjectsResponse {
  projects: JiraProject[];
}

interface IssueTypesResponse {
  issueTypes: JiraIssueType[];
}

class JiraAgent {
  private openai: OpenAI;
  private term: any;
  private mcpUrl: string;
  private cliUtils: CLIUtils;
  private errorHandler: ErrorHandler;
  private apiWrapper: APIWrapper;
  private duplicateDetection: DuplicateDetectionService;

  constructor() {
    this.openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });
    this.term = terminal.terminal;
    this.mcpUrl = process.env.ZAPIER_MCP_URL || '';
    this.cliUtils = new CLIUtils();
    this.errorHandler = new ErrorHandler();
    this.apiWrapper = new APIWrapper();
    this.duplicateDetection = new DuplicateDetectionService(
      process.env.OPENAI_API_KEY || '',
      this.mcpUrl
    );
  }

  async start() {
    this.cliUtils.showHeader();
    this.term.green('🚀 Jira AI Agent Started!\n');
    this.term.yellow('Type "help" for available commands or "exit" to quit.\n\n');
    
    // Quick setup test on startup
    const quickTester = new QuickTester();
    const setupOk = await quickTester.testBasicSetup();
    
    if (!setupOk) {
      this.term.red('\n⚠️  Setup issues detected. Some features may not work properly.\n');
      const proceed = await this.cliUtils.confirm('Continue anyway?', false);
      if (!proceed) {
        this.term.yellow('Exiting. Please fix the configuration and try again.\n');
        process.exit(1);
      }
    }
    
    await this.mainLoop();
  }

  private async mainLoop() {
    while (true) {
      this.term.cyan('What would you like to do? ');
      const input = await this.term.inputField().promise;
      this.term('\n');

      const command = input.toLowerCase().trim();

      switch (command) {
        case 'help':
          this.showHelp();
          break;
        case 'create':
        case 'create issue':
          await this.createIssueFlowWithDuplicateDetection();
          break;
        case 'search':
          await this.searchIssues();
          break;
        case 'test':
          await this.runQuickTest();
          break;
        case 'exit':
        case 'quit':
          this.term.green('Goodbye! 👋\n');
          process.exit(0);
          break;
        default:
          await this.handleNaturalLanguageInput(input);
      }
    }
  }

  private showHelp() {
    this.cliUtils.term.yellow('\n📋 Available Commands:\n');
    this.cliUtils.term('  • create / create issue - Create a new Jira issue (with duplicate detection)\n');
    this.cliUtils.term('  • search - Search existing issues\n');
    this.cliUtils.term('  • test - Run system tests\n');
    this.cliUtils.term('  • help - Show this help message\n');
    this.cliUtils.term('  • exit / quit - Exit the agent\n');
    this.cliUtils.term('  • Or just type naturally what you want to do!\n\n');
    
    this.cliUtils.term.cyan('💡 Pro Tips:\n');
    this.cliUtils.term('  • The agent will automatically check for duplicate issues\n');
    this.cliUtils.term('  • Use natural language like "Create a bug report for login issues"\n');
    this.cliUtils.term('  • All operations include automatic retry on failure\n\n');
  }

  // ENHANCED: Issue Creation Flow with Duplicate Detection
  private async createIssueFlowWithDuplicateDetection(): Promise<void> {
    try {
      this.term.magenta('\n🎯 Creating a new Jira issue...\n');

      // Get available projects with error handling
      const projects = await this.apiWrapper.makeRequest(
        () => this.getAvailableProjects(),
        'fetch-projects'
      );

      if (!projects || projects.length === 0) {
        this.cliUtils.showError('No projects available. Please check your Jira connection.');
        return;
      }

      // Collect issue details using enhanced flow
      const issueFlow = new EnhancedIssueFlow();
      const issueDetails = await issueFlow.collectIssueDetails(projects);
      
      // BONUS FEATURE: Check for duplicates
      this.cliUtils.term.yellow('\n🔍 Checking for potential duplicates...\n');
      const duplicateAnalysis = await this.duplicateDetection.checkForDuplicates(
        issueDetails.project,
        issueDetails.title,
        issueDetails.description
      );

      // Show duplicate analysis results and get user decision
      const shouldProceed = await this.duplicateDetection.displayAnalysisResults(duplicateAnalysis);
      if (!shouldProceed) {
        this.cliUtils.showInfo('Issue creation cancelled based on duplicate analysis.');
        return;
      }

      // Final confirmation with enhanced display
      const confirmed = await issueFlow.confirmCreation(issueDetails);
      if (!confirmed) {
        this.cliUtils.showInfo('Issue creation cancelled by user.');
        return;
      }

      // Create the issue with retry logic and progress indication
      const stopSpinner = this.cliUtils.showSpinner('Creating Jira issue...');
      
      const result = await this.apiWrapper.makeRequest(
        () => this.createJiraIssue(issueDetails),
        'create-issue'
      );
      
      stopSpinner();
      
      // Show enhanced creation result
      await issueFlow.showCreationResult(result);
      
      // Reset retry counter on success
      if (result.success) {
        this.errorHandler.resetRetryCount('create-issue');
      }

    } catch (error) {
      await this.errorHandler.handleError(error, 'create-issue-flow');
    }
  }

  // Quick test runner
  private async runQuickTest(): Promise<void> {
    const quickTester = new QuickTester();
    await quickTester.testBasicSetup();
  }

  // STEP 12B: Fetch Available Projects
  private async getAvailableProjects(): Promise<JiraProject[]> {
    try {
      this.term.gray('📡 Fetching available projects...\n');
      
      const response = await fetch(`${this.mcpUrl}/api/jira/projects`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as ProjectsResponse;
      return data.projects || [];
    } catch (error) {
      this.term.red(`⚠️  Failed to fetch projects: ${error.message}\n`);
      return [];
    }
  }

  // STEP 12C: Collect Issue Details Interactive Flow
  private async collectIssueDetails(projects: JiraProject[]): Promise<JiraIssue> {
    // 1. Project Selection
    this.term.yellow('\n📁 Available Projects:\n');
    projects.forEach((project, index) => {
      this.term(`  ${index + 1}. ${project.name} (${project.key})\n`);
    });

    this.term.cyan('\nSelect project (enter number): ');
    const projectIndex = await this.term.inputField().promise;
    this.term('\n');

    const selectedProject = projects[parseInt(projectIndex) - 1];
    if (!selectedProject) {
      throw new Error('Invalid project selection');
    }

    // 2. Issue Type Selection
    const issueTypes = await this.getIssueTypes(selectedProject.key);
    this.term.yellow('\n📋 Available Issue Types:\n');
    issueTypes.forEach((type, index) => {
      this.term(`  ${index + 1}. ${type.name}\n`);
    });

    this.term.cyan('\nSelect issue type (enter number): ');
    const typeIndex = await this.term.inputField().promise;
    this.term('\n');

    const selectedType = issueTypes[parseInt(typeIndex) - 1];
    if (!selectedType) {
      throw new Error('Invalid issue type selection');
    }

    // 3. Issue Title
    this.term.cyan('📝 Issue Title: ');
    const title = await this.term.inputField().promise;
    this.term('\n');

    if (!title.trim()) {
      throw new Error('Title is required');
    }

    // 4. Issue Description
    this.term.cyan('📄 Description: ');
    const description = await this.term.inputField().promise;
    this.term('\n');

    // 5. Priority Selection
    this.term.yellow('\n⚡ Priority Options:\n');
    const priorities = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
    priorities.forEach((priority, index) => {
      this.term(`  ${index + 1}. ${priority}\n`);
    });

    this.term.cyan('\nSelect priority (enter number, default: 3 - Medium): ');
    const priorityInput = await this.term.inputField({ default: '3' }).promise;
    this.term('\n');

    const selectedPriority = priorities[parseInt(priorityInput) - 1] || 'Medium';

    return {
      project: selectedProject.key,
      issueType: selectedType.name,
      title: title.trim(),
      description: description.trim(),
      priority: selectedPriority
    };
  }

  // STEP 12D: Get Issue Types for Selected Project
  private async getIssueTypes(projectKey: string): Promise<JiraIssueType[]> {
    try {
      const response = await fetch(`${this.mcpUrl}/api/jira/issue-types`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({ projectKey })
      });

      if (!response.ok) {
        // Fallback to default issue types if API fails
        this.term.yellow('⚠️  Using default issue types\n');
        return [
          { name: 'Task', id: 'task' },
          { name: 'Bug', id: 'bug' },
          { name: 'Story', id: 'story' }
        ];
      }

      const data = await response.json() as IssueTypesResponse;
      return data.issueTypes || [
        { name: 'Task', id: 'task' },
        { name: 'Bug', id: 'bug' },
        { name: 'Story', id: 'story' }
      ];
    } catch (error) {
      this.term.yellow('⚠️  Using default issue types\n');
      return [
        { name: 'Task', id: 'task' },
        { name: 'Bug', id: 'bug' },
        { name: 'Story', id: 'story' }
      ];
    }
  }

  // STEP 12E: Confirmation Step
  private async confirmIssueCreation(issue: JiraIssue): Promise<boolean> {
    this.term.yellow('\n📋 Issue Summary:\n');
    this.term(`Project: ${issue.project}\n`);
    this.term(`Type: ${issue.issueType}\n`);
    this.term(`Title: ${issue.title}\n`);
    this.term(`Description: ${issue.description}\n`);
    this.term(`Priority: ${issue.priority}\n`);

    this.term.cyan('\nCreate this issue? (y/n): ');
    const confirmation = await this.term.inputField().promise;
    this.term('\n');

    return confirmation.toLowerCase().startsWith('y');
  }

  // STEP 12F: Create Issue via API
  private async createJiraIssue(issue: JiraIssue): Promise<MCPResponse> {
    try {
      const response = await fetch(`${this.mcpUrl}/api/jira/create-issue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          projectKey: issue.project,
          issueType: issue.issueType,
          summary: issue.title,
          description: issue.description,
          priority: issue.priority,
          assignee: issue.assignee
        })
      });

      const data = await response.json() as any;
      
      if (response.ok) {
        return { success: true, data };
      } else {
        return { success: false, error: data.message || data.error || 'Unknown error' };
      }
    } catch (error) {
      return { success: false, error: error.message || 'Network error occurred' };
    }
  }

  // STEP 12G: Basic Search Implementation
  private async searchIssues(): Promise<void> {
    this.term.cyan('🔍 Search query: ');
    const query = await this.term.inputField().promise;
    this.term('\n');

    try {
      this.term.gray('🔍 Searching...\n');
      
      const response = await fetch(`${this.mcpUrl}/api/jira/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({ query })
      });

      const data = await response.json() as JiraSearchResponse;
      
      if (data.issues && data.issues.length > 0) {
        this.term.green(`\n📋 Found ${data.issues.length} issues:\n`);
        data.issues.forEach((issue, index) => {
          this.term(`  ${index + 1}. [${issue.key}] ${issue.fields.summary}\n`);
          this.term(`     Status: ${issue.fields.status.name} | Priority: ${issue.fields.priority?.name || 'None'}\n`);
        });
      } else {
        this.term.yellow('\n🔍 No issues found matching your query.\n');
      }
    } catch (error) {
      this.term.red(`❌ Search failed: ${error.message}\n`);
    }
  }

  // STEP 12H: Natural Language Processing
  private async handleNaturalLanguageInput(input: string): Promise<void> {
    try {
      // Use OpenAI to interpret the natural language input
      this.term.gray('🤔 Understanding your request...\n');
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a Jira assistant. Analyze the user's input and determine their intent. 
            Possible intents: create_issue, search_issues, help, unknown.
            Respond with just the intent and any extracted parameters in JSON format.
            Example: {"intent": "create_issue", "title": "Fix login bug", "description": "Users cannot log in"}`
          },
          {
            role: 'user',
            content: input
          }
        ],
        max_tokens: 150
      });

      const aiResponse = response.choices[0]?.message?.content;
      if (!aiResponse) {
        this.term.yellow('Sorry, I didn\'t understand that. Type "help" for available commands.\n');
        return;
      }

      const parsed = JSON.parse(aiResponse);
      
      switch (parsed.intent) {
        case 'create_issue':
          this.term.green('I understand you want to create an issue!\n');
          await this.createIssueFlowWithDuplicateDetection();
          break;
        case 'search_issues':
          this.term.green('I understand you want to search for issues!\n');
          await this.searchIssues();
          break;
        case 'help':
          this.showHelp();
          break;
        default:
          this.term.yellow('I understand you want to work with Jira, but I\'m not sure exactly what you need.\n');
          this.showHelp();
      }
    } catch (error) {
      this.term.yellow('Sorry, I didn\'t understand that. Type "help" for available commands.\n');
    }
  }
}

// Start the agent
const agent = new JiraAgent();
agent.start().catch(console.error);
