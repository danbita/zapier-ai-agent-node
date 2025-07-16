import OpenAI from 'openai';
import { ChatMessage, ConversationState, JiraIssue } from '../types/types';

export class AIAgent {
  private openai: OpenAI;
  private chatHistory: ChatMessage[] = [];

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey: apiKey
    });

    this.initializeSystemPrompt();
  }

  // Initialize system prompt for the AI agent
  private initializeSystemPrompt(): void {
    const systemPrompt = `You are a helpful Jira AI Agent assistant. Your primary role is to help users create Jira issues through natural conversation. 

Key capabilities:
- Help users create Jira issues by gathering: project, issue type, title, description, and priority
- Search existing Jira issues to prevent duplicates
- Answer questions about Jira and project management
- Provide helpful suggestions and guidance
- Be conversational and friendly

When a user wants to create an issue:
1. Identify their intent
2. Gather required information naturally through conversation
3. Check for similar existing issues
4. Confirm details before creation
5. Guide them through the process

Required fields for Jira issues:
- Project: Which project this belongs to (project key like "PROJ")
- Issue Type: Bug, Task, Story, Epic, etc.
- Title: Brief summary of the issue
- Description: Detailed explanation
- Priority: Low, Medium, High, Critical

Be natural and conversational. Don't just ask for fields in order - understand context and what they've already told you.

If they say something like "I need to report a bug" or "create a task", start helping them with issue creation.
If they want to chat about other topics, be helpful and engaging.`;

    this.chatHistory.push({
      role: 'system',
      content: systemPrompt
    });
  }

  // Get AI response from OpenAI
  async getResponse(userMessage: string, conversationState?: ConversationState): Promise<string> {
    // Add context about current issue creation state
    let contextualPrompt = userMessage;
    
    if (conversationState?.isCreatingIssue) {
      const issueProgress = Object.keys(conversationState.currentIssue).length;
      contextualPrompt += `\n\nContext: User is currently creating a Jira issue. Progress: ${issueProgress}/5 fields collected. Current issue data: ${JSON.stringify(conversationState.currentIssue)}`;
    }
    
    // Add user message to history
    this.chatHistory.push({
      role: 'user',
      content: userMessage
    });

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          ...this.chatHistory,
          {
            role: 'user',
            content: contextualPrompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      });
      
      const response = completion.choices[0].message.content || 'I apologize, but I couldn\'t process your request. Please try again.';
      
      // Add AI response to history
      this.chatHistory.push({
        role: 'assistant',
        content: response
      });
      
      return response;
    } catch (error) {
      throw new Error(`AI Service Error: ${error.message}`);
    }
  }

  // Extract issue information from conversation
  extractIssueInformation(lastUserMessage: string, currentIssue: Partial<JiraIssue>): Partial<JiraIssue> {
    const updatedIssue = { ...currentIssue };

    // Extract project
    if (!updatedIssue.project) {
      const projectMatch = lastUserMessage.match(/project\s+(\w+)/i);
      if (projectMatch) {
        updatedIssue.project = projectMatch[1];
      }
    }
    
    // Extract issue type
    if (!updatedIssue.issueType) {
      const typeMatch = lastUserMessage.match(/\b(bug|task|story|epic)\b/i);
      if (typeMatch) {
        updatedIssue.issueType = typeMatch[1];
      }
    }
    
    // Extract priority
    if (!updatedIssue.priority) {
      const priorityMatch = lastUserMessage.match(/\b(low|medium|high|critical)\b/i);
      if (priorityMatch) {
        updatedIssue.priority = priorityMatch[1];
      }
    }

    // Extract title from quotes or after "titled" or "called"
    if (!updatedIssue.title) {
      const titleMatch = lastUserMessage.match(/"([^"]+)"|titled\s+(.+)|called\s+(.+)/i);
      if (titleMatch) {
        updatedIssue.title = titleMatch[1] || titleMatch[2] || titleMatch[3];
      }
    }

    return updatedIssue;
  }

  // Detect if user wants to create an issue
  detectIssueCreationIntent(message: string): boolean {
    const creationKeywords = [
      'create', 'issue', 'bug', 'task', 'story', 'epic', 
      'report', 'file', 'submit', 'new', 'jira'
    ];
    
    return creationKeywords.some(keyword => 
      message.toLowerCase().includes(keyword)
    );
  }

  // Check if issue has all required fields
  isIssueComplete(issue: Partial<JiraIssue>): boolean {
    const required = ['project', 'issueType', 'title', 'description', 'priority'];
    return required.every(field => issue[field]);
  }

  // Reset conversation history (but keep system prompt)
  resetConversation(): void {
    this.chatHistory = this.chatHistory.slice(0, 1); // Keep only system prompt
  }

  // Get chat history
  getChatHistory(): ChatMessage[] {
    return [...this.chatHistory];
  }

  // Add message to history manually
  addToHistory(message: ChatMessage): void {
    this.chatHistory.push(message);
  }
}