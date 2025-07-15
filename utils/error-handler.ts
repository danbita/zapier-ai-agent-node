// utils/error-handler.ts - Comprehensive error handling for Step 14
import * as terminal from 'terminal-kit';

export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  JIRA_API_ERROR = 'JIRA_API_ERROR',
  OPENAI_ERROR = 'OPENAI_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly isRetryable: boolean;
  public readonly statusCode?: number;

  constructor(
    message: string,
    type: ErrorType,
    isRetryable: boolean = false,
    statusCode?: number
  ) {
    super(message);
    this.type = type;
    this.isRetryable = isRetryable;
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

export class ErrorHandler {
  private term: any;
  private retryAttempts: Map<string, number> = new Map();
  private maxRetries: number = 3;

  constructor() {
    this.term = terminal.terminal;
  }

  // Main error handling method
  async handleError(error: Error | AppError, context?: string): Promise<boolean> {
    const appError = this.normalizeError(error);
    
    // Display user-friendly error message
    this.displayError(appError, context);
    
    // Handle retryable errors
    if (appError.isRetryable && this.shouldRetry(context || 'default')) {
      return await this.promptForRetry(context || 'default');
    }
    
    return false;
  }

  // Convert any error to AppError
  private normalizeError(error: Error | AppError): AppError {
    if (error instanceof AppError) {
      return error;
    }

    const message = error.message.toLowerCase();

    // Network errors
    if (message.includes('econnrefused') || message.includes('enotfound') || message.includes('timeout')) {
      return new AppError(
        'Network connection failed. Please check your internet connection and try again.',
        ErrorType.NETWORK_ERROR,
        true
      );
    }

    // Authentication errors
    if (message.includes('401') || message.includes('unauthorized') || message.includes('invalid api key')) {
      return new AppError(
        'Authentication failed. Please check your API credentials in the .env file.',
        ErrorType.AUTHENTICATION_ERROR,
        false
      );
    }

    // Jira API errors
    if (message.includes('400') || message.includes('404') || message.includes('403')) {
      return new AppError(
        'Jira API error. Please check your project permissions and try again.',
        ErrorType.JIRA_API_ERROR,
        true
      );
    }

    // OpenAI errors
    if (message.includes('openai') || message.includes('gpt')) {
      return new AppError(
        'OpenAI API error. Please check your API key and quota.',
        ErrorType.OPENAI_ERROR,
        true
      );
    }

    // Default to unknown error
    return new AppError(
      error.message || 'An unexpected error occurred.',
      ErrorType.UNKNOWN_ERROR,
      true
    );
  }

  // Display user-friendly error messages
  private displayError(error: AppError, context?: string): void {
    const contextStr = context ? ` (${context})` : '';
    
    this.term.red(`\n❌ Error${contextStr}:\n`);
    this.term.red(`   ${error.message}\n`);

    // Show specific guidance based on error type
    switch (error.type) {
      case ErrorType.NETWORK_ERROR:
        this.term.yellow('\n💡 Troubleshooting tips:\n');
        this.term.yellow('   • Check your internet connection\n');
        this.term.yellow('   • Verify the Zapier MCP URL in your .env file\n');
        this.term.yellow('   • Try again in a few moments\n');
        break;

      case ErrorType.AUTHENTICATION_ERROR:
        this.term.yellow('\n💡 Troubleshooting tips:\n');
        this.term.yellow('   • Check your OpenAI API key in .env file\n');
        this.term.yellow('   • Verify Zapier MCP authentication\n');
        this.term.yellow('   • Ensure Jira permissions are properly configured\n');
        break;

      case ErrorType.VALIDATION_ERROR:
        this.term.yellow('\n💡 Please check your input and try again.\n');
        break;

      case ErrorType.JIRA_API_ERROR:
        this.term.yellow('\n💡 Troubleshooting tips:\n');
        this.term.yellow('   • Verify the project exists and you have access\n');
        this.term.yellow('   • Check your Jira permissions\n');
        this.term.yellow('   • Try with a different project\n');
        break;

      case ErrorType.OPENAI_ERROR:
        this.term.yellow('\n💡 Troubleshooting tips:\n');
        this.term.yellow('   • Check your OpenAI API quota and billing\n');
        this.term.yellow('   • Verify your API key is valid\n');
        this.term.yellow('   • Try again in a few moments\n');
        break;
    }
  }

  // Check if we should retry
  private shouldRetry(context: string): boolean {
    const attempts = this.retryAttempts.get(context) || 0;
    return attempts < this.maxRetries;
  }

  // Prompt user for retry
  private async promptForRetry(context: string): Promise<boolean> {
    const attempts = this.retryAttempts.get(context) || 0;
    this.retryAttempts.set(context, attempts + 1);
    
    this.term.yellow(`\n🔄 Would you like to retry? (Attempt ${attempts + 1}/${this.maxRetries})\n`);
    this.term.cyan('Retry? (y/n): ');
    
    const response = await this.term.inputField().promise;
    this.term('\n');
    
    if (response.toLowerCase().startsWith('y')) {
      // Add delay before retry
      await this.retryDelay(attempts);
      return true;
    }
    
    // Reset retry count if user chooses not to retry
    this.retryAttempts.delete(context);
    return false;
  }

  // Progressive delay for retries
  private async retryDelay(attemptNumber: number): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, attemptNumber), 5000); // Exponential backoff, max 5s
    
    this.term.yellow(`⏳ Waiting ${delay / 1000} seconds before retry...\n`);
    
    // Show countdown
    for (let i = Math.floor(delay / 1000); i > 0; i--) {
      this.term.gray(`   ${i}s remaining...\r`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    this.term('\n');
  }

  // Reset retry counter (call after successful operation)
  resetRetryCount(context: string = 'default'): void {
    this.retryAttempts.delete(context);
  }

  // Log error for debugging
  private logError(error: AppError, context?: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      context: context || 'unknown',
      type: error.type,
      message: error.message,
      statusCode: error.statusCode,
      stack: error.stack
    };
    
    // In production, you might want to send this to a logging service
    console.error('Error Log:', JSON.stringify(logEntry, null, 2));
  }

  // Create specific error types
  static createNetworkError(message: string): AppError {
    return new AppError(message, ErrorType.NETWORK_ERROR, true);
  }

  static createAuthError(message: string): AppError {
    return new AppError(message, ErrorType.AUTHENTICATION_ERROR, false);
  }

  static createValidationError(message: string): AppError {
    return new AppError(message, ErrorType.VALIDATION_ERROR, false);
  }

  static createJiraError(message: string, statusCode?: number): AppError {
    return new AppError(message, ErrorType.JIRA_API_ERROR, true, statusCode);
  }

  static createOpenAIError(message: string): AppError {
    return new AppError(message, ErrorType.OPENAI_ERROR, true);
  }
}

// Wrapper for API calls with error handling
export class APIWrapper {
  private errorHandler: ErrorHandler;

  constructor() {
    this.errorHandler = new ErrorHandler();
  }

  async makeRequest<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Ask user if they want to retry
        const shouldRetry = await this.errorHandler.handleError(error, context);
        if (!shouldRetry) {
          throw error;
        }
      }
    }
    
    throw lastError!;
  }
}