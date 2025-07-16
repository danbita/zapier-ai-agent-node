import * as dotenv from 'dotenv';
import { AIAgent } from './services/AIAgent';
import { MCPClient } from './services/MCPClient';
import { UIManager } from './ui/UIManager';
import { IssueManager } from './managers/IssueManager';
import { ChatManager } from './managers/ChatManager';

// Load environment variables
dotenv.config();

class JiraAIAgent {
  private aiAgent: AIAgent;
  private mcpClient: MCPClient;
  private uiManager: UIManager;
  private issueManager: IssueManager;
  private chatManager: ChatManager;

  constructor() {
    // Initialize UI first
    this.uiManager = new UIManager();
    
    // Initialize MCP client (no API key needed for new MCP servers)
    this.mcpClient = new MCPClient(
      process.env.ZAPIER_MCP_URL || 'https://mcp.zapier.com'
    );

    // Initialize AI agent with MCP client
    this.aiAgent = new AIAgent(this.mcpClient);

    // Initialize managers
    this.issueManager = new IssueManager(this.mcpClient, this.uiManager);
    this.chatManager = new ChatManager(this.aiAgent, this.uiManager, this.issueManager);
  }

  // Main application entry point
  async start(): Promise<void> {
    this.uiManager.showWelcomeMessage();
    await this.testConnections();
    await this.runMainLoop();
  }

  // Test all connections on startup
  private async testConnections(): Promise<void> {
    this.uiManager.showInfo('🔍 Testing connections...');
    
    // Test MCP connection first
    let mcpConnected = false;
    try {
      mcpConnected = await this.mcpClient.testConnection();
      if (mcpConnected) {
        this.uiManager.showSuccess('MCP connection successful!');
      } else {
        this.uiManager.showWarning('MCP connection failed. Limited functionality available.');
      }
    } catch (error) {
      this.uiManager.showWarning(`MCP connection failed: ${error.message}`);
    }
    
    // Test individual services if MCP is connected
    if (mcpConnected) {
      await this.testAvailableServices();
    }
    
    console.log(''); // Add spacing
  }

  // Test available services
  private async testAvailableServices(): Promise<void> {
    try {
      // Test OpenAI (direct connection)
      this.uiManager.showInfo('🤖 Testing AI functionality...');
      const aiWorking = await this.aiAgent.testAIConnection();
      if (aiWorking) {
        this.uiManager.showSuccess('AI service working!');
      } else {
        this.uiManager.showWarning('AI service not available - check OpenAI API key');
      }

      // Test Jira tools via MCP
      this.uiManager.showInfo('🎫 Testing Jira connectivity...');
      const jiraWorking = await this.testJiraConnection();
      if (jiraWorking) {
        this.uiManager.showSuccess('Jira service working via MCP!');
      } else {
        this.uiManager.showWarning('Jira service not available via MCP');
      }

      // Show available tools
      try {
        const tools = await this.mcpClient.getAvailableTools();
        if (Array.isArray(tools) && tools.length > 0) {
          this.uiManager.showInfo(`Available MCP tools: ${tools.join(', ')}`);
        } else {
          this.uiManager.showInfo('MCP tools list not available');
        }
      } catch (error) {
        this.uiManager.showWarning('Could not list available tools');
      }

    } catch (error) {
      this.uiManager.showWarning(`Service testing failed: ${error.message}`);
    }
  }

  // Test Jira connection specifically
  private async testJiraConnection(): Promise<boolean> {
    try {
      // Try to get projects as a test
      await this.mcpClient.getJiraProjects();
      return true;
    } catch (error) {
      console.error('Jira test failed:', error.message);
      return false;
    }
  }

  // Main application loop
  private async runMainLoop(): Promise<void> {
    while (true) {
      try {
        this.uiManager.showMainMenu();
        const choice = await this.uiManager.getUserChoice();
        
        switch (choice) {
          case 1:
            await this.issueManager.createIssueGuided();
            await this.uiManager.waitForReturn();
            break;
            
          case 2:
            await this.issueManager.searchIssues();
            await this.uiManager.waitForReturn();
            break;
            
          case 3:
            await this.chatManager.startChatMode();
            break;
            
          case 4:
            this.exit();
            return;
            
          default:
            this.uiManager.showError('Invalid choice. Please try again.');
        }
        
        // Clear screen before showing menu again
        this.uiManager.showWelcomeMessage();
        
      } catch (error) {
        this.uiManager.showError(`Application error: ${error.message}`);
        await this.uiManager.waitForReturn();
      }
    }
  }

  // Clean application exit
  private exit(): void {
    this.uiManager.showExitMessage();
    this.uiManager.close();
    process.exit(0);
  }

  // Graceful shutdown handler
  private setupSignalHandlers(): void {
    process.on('SIGINT', () => {
      console.log('\n\nReceived SIGINT. Shutting down gracefully...');
      this.exit();
    });

    process.on('SIGTERM', () => {
      console.log('\n\nReceived SIGTERM. Shutting down gracefully...');
      this.exit();
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.uiManager.showError('A critical error occurred. Shutting down...');
      this.exit();
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.uiManager.showError('An unhandled promise rejection occurred.');
    });
  }
}

// Application startup
async function main() {
  const app = new JiraAIAgent();
  
  // Setup signal handlers for graceful shutdown
  app['setupSignalHandlers'](); // Access private method for setup
  
  try {
    await app.start();
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  console.error('Application crashed:', error);
  process.exit(1);
});
