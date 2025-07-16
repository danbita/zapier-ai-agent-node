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
    // Initialize services
    this.uiManager = new UIManager();
    
    this.aiAgent = new AIAgent(
      process.env.OPENAI_API_KEY
    );
    
    this.mcpClient = new MCPClient(
      process.env.ZAPIER_MCP_URL || 'https://mcp.zapier.com',
      process.env.ZAPIER_API_KEY || ''
    );

    // Initialize managers
    this.issueManager = new IssueManager(this.mcpClient, this.uiManager);
    this.chatManager = new ChatManager(this.aiAgent, this.uiManager, this.issueManager);
  }

  // Main application entry point
  async start(): Promise<void> {
    this.uiManager.showWelcomeMessage();
    await this.testConnections();
    await this.mainLoop();
  }

  // Test all connections on startup
  private async testConnections(): Promise<void> {
    this.uiManager.showInfo('🔍 Testing connections...');
    
    // Test MCP connection
    try {
      const mcpConnected = await this.mcpClient.testConnection();
      if (mcpConnected) {
        this.uiManager.showSuccess('MCP connection successful!');
      } else {
        this.uiManager.showWarning('MCP connection failed. Using mock mode.');
      }
    } catch (error) {
      this.uiManager.showWarning(`MCP connection failed: ${error.message}`);
    }
    
    console.log(''); // Add spacing
  }

  // Main application loop
  private async mainLoop(): Promise<void> {
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
