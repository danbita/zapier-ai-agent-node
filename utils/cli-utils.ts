// utils/cli-utils.ts - Enhanced CLI utilities for Step 13
import * as terminal from 'terminal-kit';

export class CLIUtils {
  public term: any;

  constructor() {
    this.term = terminal.terminal;
  }

  // Enhanced input with validation
  async getValidatedInput(
    prompt: string, 
    validator: (input: string) => boolean | string,
    defaultValue?: string
  ): Promise<string> {
    while (true) {
      this.term.cyan(prompt);
      const input = await this.term.inputField({ 
        default: defaultValue || '' 
      }).promise;
      this.term('\n');

      const validation = validator(input);
      
      if (validation === true) {
        return input;
      } else if (typeof validation === 'string') {
        this.term.red(`❌ ${validation}\n`);
      } else {
        this.term.red('❌ Invalid input. Please try again.\n');
      }
    }
  }

  // Progress bar for long operations
  async showProgressBar(operation: Promise<any>, message: string): Promise<any> {
    const progressBar = this.term.progressBar({
      width: 50,
      title: message,
      eta: true,
      percent: true
    });

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      progressBar.update(Math.random());
    }, 200);

    try {
      const result = await operation;
      clearInterval(progressInterval);
      progressBar.update(1);
      this.term('\n');
      return result;
    } catch (error) {
      clearInterval(progressInterval);
      progressBar.stop();
      this.term('\n');
      throw error;
    }
  }

  // Menu selection with arrow keys
  async showSelectionMenu(title: string, options: string[]): Promise<number> {
    this.term.yellow(`\n${title}\n`);
    
    const items = options.map((option, index) => `${index + 1}. ${option}`);
    
    const response = await this.term.singleLineMenu(items, {
      selectedStyle: this.term.inverse,
      cancelable: false
    }).promise;

    this.term('\n');
    return response.selectedIndex;
  }

  // Better confirmation with clear options
  async confirm(message: string, defaultValue = false): Promise<boolean> {
    const defaultText = defaultValue ? '[Y/n]' : '[y/N]';
    this.term.cyan(`${message} ${defaultText}: `);
    
    const response = await this.term.inputField().promise;
    this.term('\n');

    if (!response.trim()) return defaultValue;
    return response.toLowerCase().startsWith('y');
  }

  // Success/Error/Warning messages with icons
  showSuccess(message: string): void {
    this.term.green(`✅ ${message}\n`);
  }

  showError(message: string): void {
    this.term.red(`❌ ${message}\n`);
  }

  showWarning(message: string): void {
    this.term.yellow(`⚠️  ${message}\n`);
  }

  showInfo(message: string): void {
    this.term.blue(`ℹ️  ${message}\n`);
  }

  // Loading spinner
  showSpinner(message: string): () => void {
    const spinner = this.term.spinner('dotSpinner');
    this.term.cyan(`${message} `);
    spinner.animate();
    
    return () => {
      spinner.stop();
      this.term('\n');
    };
  }

  // Clear screen and show header
  showHeader(): void {
    this.term.clear();
    this.term.bold.magenta('\n╔═══════════════════════════════════════════════════════════════════╗\n');
    this.term.bold.magenta('║                        🎯 Jira AI Agent                          ║\n');
    this.term.bold.magenta('║                    Powered by OpenAI & Zapier MCP                ║\n');
    this.term.bold.magenta('╚═══════════════════════════════════════════════════════════════════╝\n\n');
  }

  // Input validators
  static validators = {
    required: (input: string) => input.trim().length > 0 || 'This field is required',
    
    minLength: (min: number) => (input: string) => 
      input.length >= min || `Minimum length is ${min} characters`,
    
    maxLength: (max: number) => (input: string) => 
      input.length <= max || `Maximum length is ${max} characters`,
    
    email: (input: string) => 
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input) || 'Invalid email format',
    
    number: (input: string) => 
      !isNaN(Number(input)) || 'Must be a valid number',
    
    range: (min: number, max: number) => (input: string) => {
      const num = Number(input);
      return (!isNaN(num) && num >= min && num <= max) || 
             `Must be between ${min} and ${max}`;
    }
  };
}

// Enhanced Issue Creation Flow with better UX
export class EnhancedIssueFlow {
  private cliUtils: CLIUtils;

  constructor() {
    this.cliUtils = new CLIUtils();
  }

  async collectIssueDetails(projects: any[]): Promise<any> {
    // Project selection with enhanced menu
    const projectNames = projects.map(p => `${p.name} (${p.key})`);
    const projectIndex = await this.cliUtils.showSelectionMenu('📁 Select Project:', projectNames);
    const selectedProject = projects[projectIndex];

    // Issue type selection
    const issueTypes = ['Task', 'Bug', 'Story', 'Epic'];
    const typeIndex = await this.cliUtils.showSelectionMenu('📋 Select Issue Type:', issueTypes);
    const selectedType = issueTypes[typeIndex];

    // Title with validation
    const title = await this.cliUtils.getValidatedInput(
      '📝 Issue Title: ',
      CLIUtils.validators.required
    );

    // Description with validation
    const description = await this.cliUtils.getValidatedInput(
      '📄 Description: ',
      CLIUtils.validators.minLength(10)
    );

    // Priority selection
    const priorities = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
    const priorityIndex = await this.cliUtils.showSelectionMenu('⚡ Select Priority:', priorities);
    const selectedPriority = priorities[priorityIndex];

    // Optional assignee
    const assignee = await this.cliUtils.getValidatedInput(
      '👤 Assignee (optional, press Enter to skip): ',
      () => true // No validation, optional field
    );

    return {
      project: selectedProject.key,
      issueType: selectedType,
      title,
      description,
      priority: selectedPriority,
      assignee: assignee.trim() || null
    };
  }

  async showIssueSummary(issue: any): Promise<void> {
    this.cliUtils.term.yellow('\n📋 Issue Summary:\n');
    this.cliUtils.term.yellow('─'.repeat(50) + '\n');
    this.cliUtils.term(`📁 Project:     ${issue.project}\n`);
    this.cliUtils.term(`📋 Type:        ${issue.issueType}\n`);
    this.cliUtils.term(`📝 Title:       ${issue.title}\n`);
    this.cliUtils.term(`📄 Description: ${issue.description.substring(0, 50)}${issue.description.length > 50 ? '...' : ''}\n`);
    this.cliUtils.term(`⚡ Priority:    ${issue.priority}\n`);
    this.cliUtils.term(`👤 Assignee:    ${issue.assignee || 'Unassigned'}\n`);
    this.cliUtils.term.yellow('─'.repeat(50) + '\n');
  }

  async confirmCreation(issue: any): Promise<boolean> {
    await this.showIssueSummary(issue);
    return await this.cliUtils.confirm('Create this issue?', false);
  }

  async showCreationResult(result: any): Promise<void> {
    if (result.success) {
      this.cliUtils.showSuccess('Issue created successfully!');
      this.cliUtils.term.green(`🔗 Issue Key: ${result.data.key}\n`);
      if (result.data.url) {
        this.cliUtils.term.green(`🌐 URL: ${result.data.url}\n`);
      }
    } else {
      this.cliUtils.showError(`Failed to create issue: ${result.error}`);
    }
  }
}