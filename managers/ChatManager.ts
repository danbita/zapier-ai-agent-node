import { ConversationState, JiraIssue } from '../types/types';
import { AIAgent } from '../services/AIAgent';
import { UIManager } from '../ui/UIManager';
import { IssueManager } from '../managers/IssueManager';

export class ChatManager {
  private aiAgent: AIAgent;
  private uiManager: UIManager;
  private issueManager: IssueManager;
  private conversationState: ConversationState;

  constructor(aiAgent: AIAgent, uiManager: UIManager, issueManager: IssueManager) {
    this.aiAgent = aiAgent;
    this.uiManager = uiManager;
    this.issueManager = issueManager;
    this.resetConversationState();
  }

  // Start chat mode
  async startChatMode(): Promise<void> {
    this.uiManager.showChatHeader();
    this.resetConversationState();
    
    // Welcome message
    this.uiManager.showInfo('Agent: Hi! I\'m your Jira AI assistant. How can I help you today? 😊\n');
    
    await this.chatLoop();
  }

  // Main chat loop
  private async chatLoop(): Promise<void> {
    while (true) {
      try {
        // Get user input
        const userInput = await this.uiManager.getChatInput();
        
        // Check for exit command
        if (userInput.toLowerCase() === 'exit') {
          break;
        }
        
        if (!userInput) {
          continue;
        }
        
        // Get AI response
        const aiResponse = await this.aiAgent.getResponse(userInput, this.conversationState);
        
        // Display AI response with typewriter effect
        process.stdout.write('\nAgent: ');
        await this.uiManager.typewriterEffect(aiResponse);
        process.stdout.write('\n\n');
        
        // Handle issue creation flow
        await this.handleIssueCreationFlow(userInput, aiResponse);
        
      } catch (error) {
        this.uiManager.showError(`Error: ${error.message}`);
      }
    }
  }

  // Handle issue creation flow based on conversation
  private async handleIssueCreationFlow(userMessage: string, aiResponse: string): Promise<void> {
    // Detect if user wants to create an issue
    if (this.aiAgent.detectIssueCreationIntent(userMessage) && !this.conversationState.isCreatingIssue) {
      this.conversationState.isCreatingIssue = true;
      this.conversationState.currentIssue = {};
    }
    
    // Extract issue information from conversation if we're creating an issue
    if (this.conversationState.isCreatingIssue) {
      this.conversationState.currentIssue = this.aiAgent.extractIssueInformation(
        userMessage, 
        this.conversationState.currentIssue
      );
      
      // Check if we have all required fields
      if (this.aiAgent.isIssueComplete(this.conversationState.currentIssue)) {
        await this.handleIssueCompletion();
      }
    }
  }

  // Handle issue completion
  private async handleIssueCompletion(): Promise<void> {
    if (!this.conversationState.awaitingConfirmation) {
      this.conversationState.awaitingConfirmation = true;
      
      // Show issue summary
      this.uiManager.showInfo('\n═══ ISSUE READY FOR CREATION ═══');
      this.uiManager.showIssueSummary(this.conversationState.currentIssue);
      
      // Ask for confirmation
      const confirmation = await this.uiManager.askConfirmation('Create this issue in Jira? (yes/no): ');
      
      if (confirmation) {
        // Create the issue
        await this.issueManager.createIssue(
          this.conversationState.currentIssue as JiraIssue, 
          true // Check for duplicates
        );
        
        this.uiManager.showInfo('\nWhat else can I help you with?');
      } else {
        this.uiManager.showInfo('Issue creation cancelled. What else can I help you with?');
      }
      
      // Reset conversation state
      this.resetConversationState();
    }
  }

  // Reset conversation state
  private resetConversationState(): void {
    this.conversationState = {
      isCreatingIssue: false,
      currentIssue: {},
      pendingField: null,
      awaitingConfirmation: false
    };
  }

  // Get current conversation state
  getConversationState(): ConversationState {
    return { ...this.conversationState };
  }

  // Set conversation state (useful for testing)
  setConversationState(state: ConversationState): void {
    this.conversationState = { ...state };
  }

  // Manual issue creation trigger (if user wants to switch to guided mode)
  async triggerGuidedIssueCreation(): Promise<void> {
    this.uiManager.showInfo('Switching to guided issue creation mode...\n');
    await this.issueManager.createIssueGuided();
    this.uiManager.showInfo('\nReturning to chat mode. What else can I help you with?');
    this.resetConversationState();
  }

  // Reset AI conversation history
  resetAIHistory(): void {
    this.aiAgent.resetConversation();
    this.uiManager.showInfo('Conversation history cleared. Starting fresh!');
  }

  // Show help information
  showHelp(): void {
    this.uiManager.showInfo(`
Available commands in chat mode:
• "exit" - Return to main menu
• "I need to create a bug/task/story" - Start issue creation
• "search for issues about [topic]" - Search existing issues
• Ask questions about Jira or project management
• Request help with issue descriptions or priorities

Just chat naturally - I'll understand what you need!
    `);
  }
}