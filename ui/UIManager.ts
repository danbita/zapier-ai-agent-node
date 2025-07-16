import { terminal as term } from 'terminal-kit';
import readline from 'readline';
import { JiraIssue, JiraSearchResult } from '../types/types';

export class UIManager {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  // Welcome message with styling
  showWelcomeMessage(): void {
    term.clear();
    term.bold.cyan('═══════════════════════════════════════════════════════════\n');
    term.bold.cyan('                    JIRA AI AGENT                        \n');
    term.bold.cyan('═══════════════════════════════════════════════════════════\n');
    term.white('\nWelcome to the Jira AI Agent CLI!\n');
    term.gray('This agent helps you create and manage Jira issues through natural language.\n\n');
  }

  // Main menu display
  showMainMenu(): void {
    term.bold.yellow('What would you like to do?\n\n');
    term.green('1. ');
    term.white('Create a new Jira issue\n');
    term.green('2. ');
    term.white('Search existing issues\n');
    term.green('3. ');
    term.white('Chat with agent\n');
    term.green('4. ');
    term.white('Exit\n\n');
  }

  // Get user choice from menu
  async getUserChoice(): Promise<number> {
    return new Promise((resolve) => {
      term.bold.cyan('Enter your choice (1-4): ');
      
      this.rl.question('', (answer) => {
        const choice = parseInt(answer.trim());
        
        if (choice >= 1 && choice <= 4) {
          resolve(choice);
        } else {
          term.red('\nInvalid choice. Please enter 1, 2, 3, or 4.\n\n');
          resolve(this.getUserChoice());
        }
      });
    });
  }

  // Generic question asking method
  async askQuestion(prompt: string, field: string): Promise<string> {
    return new Promise((resolve) => {
      term.bold.cyan(prompt);
      
      this.rl.question('', (answer) => {
        const trimmedAnswer = answer.trim();
        
        if (!trimmedAnswer) {
          term.red(`\n${field} cannot be empty. Please try again.\n`);
          resolve(this.askQuestion(prompt, field));
        } else {
          term.gray(`✓ ${field}: ${trimmedAnswer}\n\n`);
          resolve(trimmedAnswer);
        }
      });
    });
  }

  // Ask for confirmation
  async askConfirmation(prompt: string): Promise<boolean> {
    return new Promise((resolve) => {
      term.bold.cyan(prompt);
      
      this.rl.question('', (answer) => {
        const response = answer.trim().toLowerCase();
        
        if (response === 'y' || response === 'yes') {
          resolve(true);
        } else if (response === 'n' || response === 'no') {
          resolve(false);
        } else {
          term.red('\nPlease enter y/yes or n/no.\n');
          resolve(this.askConfirmation(prompt));
        }
      });
    });
  }

  // Get user input for chat
  async getChatInput(): Promise<string> {
    return new Promise((resolve) => {
      term.bold.cyan('You: ');
      
      this.rl.question('', (input) => {
        resolve(input.trim());
      });
    });
  }

  // Display issue creation form header
  showIssueCreationHeader(): void {
    term.clear();
    term.bold.green('═══ CREATE NEW JIRA ISSUE ═══\n\n');
  }

  // Display issue summary
  showIssueSummary(issue: Partial<JiraIssue>): void {
    term.bold.yellow('═══ ISSUE SUMMARY ═══\n');
    term.white(`Project: ${issue.project}\n`);
    term.white(`Type: ${issue.issueType}\n`);
    term.white(`Title: ${issue.title}\n`);
    term.white(`Description: ${issue.description}\n`);
    term.white(`Priority: ${issue.priority}\n\n`);
  }

  // Display search results
  showSearchResults(issues: JiraSearchResult[]): void {
    if (issues.length === 0) {
      term.yellow('No issues found matching your search.\n\n');
    } else {
      term.bold.green(`Found ${issues.length} issue(s):\n\n`);
      
      issues.forEach((issue, index) => {
        term.white(`${index + 1}. `);
        term.bold.white(`${issue.key}: ${issue.fields.summary}\n`);
        term.gray(`   Type: ${issue.fields.issuetype.name} | Status: ${issue.fields.status.name}\n`);
        term.gray(`   Priority: ${issue.fields.priority?.name || 'None'}\n`);
        term.blue(`   URL: ${issue.self.replace('/rest/api/3/issue/', '/browse/')}\n\n`);
      });
    }
  }

  // Display similar issues warning
  showSimilarIssues(issues: JiraSearchResult[]): void {
    term.bold.yellow('⚠️  Found similar existing issues:\n\n');
    
    issues.slice(0, 3).forEach((issue, index) => {
      term.white(`${index + 1}. `);
      term.bold.white(`${issue.key}: ${issue.fields.summary}\n`);
      term.gray(`   Status: ${issue.fields.status.name} | Type: ${issue.fields.issuetype.name}\n\n`);
    });
  }

  // Success/Error Messages
  showSuccess(message: string, issueKey?: string, url?: string): void {
    term.bold.green(`✅ ${message}\n`);
    if (issueKey) term.gray(`Issue ID: ${issueKey}\n`);
    if (url) term.gray(`URL: ${url}\n\n`);
  }

  showError(message: string): void {
    term.red(`❌ ${message}\n\n`);
  }

  showWarning(message: string): void {
    term.yellow(`⚠️  ${message}\n`);
  }

  showInfo(message: string): void {
    term.gray(`${message}\n`);
  }

  // Chat mode header
  showChatHeader(): void {
    term.clear();
    term.bold.green('═══ CHAT MODE ═══\n\n');
    term.gray('Chat with the AI agent. Type "exit" to return to main menu.\n');
    term.gray('You can ask me to create Jira issues, search for issues, or just chat!\n\n');
  }

  // Search header
  showSearchHeader(): void {
    term.clear();
    term.bold.green('═══ SEARCH ISSUES ═══\n\n');
  }

  // Loading animation
  async showLoadingAnimation(message: string = 'Processing'): Promise<void> {
    return new Promise((resolve) => {
      const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let i = 0;
      
      const interval = setInterval(() => {
        term.saveCursor();
        term.yellow(`${frames[i % frames.length]} ${message}...`);
        term.restoreCursor();
        i++;
      }, 100);
      
      setTimeout(() => {
        clearInterval(interval);
        term.eraseLine();
        resolve();
      }, 2000);
    });
  }

  // Typewriter effect for AI responses
  async typewriterEffect(text: string, speed: number = 30): Promise<void> {
    return new Promise((resolve) => {
      let i = 0;
      const timer = setInterval(() => {
        if (i < text.length) {
          term.white(text.charAt(i));
          i++;
        } else {
          clearInterval(timer);
          resolve();
        }
      }, speed);
    });
  }

  // Return to main menu prompt
  async waitForReturn(): Promise<void> {
    return new Promise((resolve) => {
      term.bold.cyan('Press Enter to return to main menu...');
      
      this.rl.question('', () => {
        resolve();
      });
    });
  }

  // Exit message
  showExitMessage(): void {
    term.clear();
    term.bold.green('Thank you for using Jira AI Agent!\n');
    term.gray('Goodbye! 👋\n');
  }

  // Close readline interface
  close(): void {
    this.rl.close();
  }
}