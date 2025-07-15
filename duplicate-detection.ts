// features/duplicate-detection.ts - Smart duplicate detection for Step 16
import { OpenAI } from 'openai';
import fetch from 'node-fetch';
import { CLIUtils } from '../utils/cli-utils';
import { ErrorHandler, AppError, ErrorType } from '../utils/error-handler';

interface SimilarIssue {
  key: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  similarity: number;
  reason: string;
}

interface DuplicateAnalysis {
  hasPotentialDuplicates: boolean;
  similarIssues: SimilarIssue[];
  recommendations: string[];
}

export class DuplicateDetectionService {
  private openai: OpenAI;
  private mcpUrl: string;
  private cliUtils: CLIUtils;
  private errorHandler: ErrorHandler;

  constructor(openaiKey: string, mcpUrl: string) {
    this.openai = new OpenAI({ apiKey: openaiKey });
    this.mcpUrl = mcpUrl;
    this.cliUtils = new CLIUtils();
    this.errorHandler = new ErrorHandler();
  }

  // Main duplicate detection method
  async checkForDuplicates(
    projectKey: string,
    title: string,
    description: string
  ): Promise<DuplicateAnalysis> {
    try {
      this.cliUtils.showInfo('🔍 Checking for similar issues...');
      
      // Step 1: Search for potentially similar issues
      const searchResults = await this.searchSimilarIssues(projectKey, title, description);
      
      if (searchResults.length === 0) {
        return {
          hasPotentialDuplicates: false,
          similarIssues: [],
          recommendations: ['✅ No similar issues found. Safe to proceed with creation.']
        };
      }

      // Step 2: Use AI to analyze similarity
      this.cliUtils.showInfo(`📊 Analyzing ${searchResults.length} potential matches...`);
      const analysisResults = await this.analyzeIssueSimilarity(
        { title, description },
        searchResults
      );

      // Step 3: Filter and rank results
      const significantMatches = analysisResults.filter(result => result.similarity > 0.6);

      return {
        hasPotentialDuplicates: significantMatches.length > 0,
        similarIssues: significantMatches,
        recommendations: this.generateRecommendations(significantMatches)
      };

    } catch (error) {
      await this.errorHandler.handleError(error, 'duplicate-detection');
      
      // Return safe fallback
      return {
        hasPotentialDuplicates: false,
        similarIssues: [],
        recommendations: ['⚠️ Unable to check for duplicates. Proceed with caution.']
      };
    }
  }

  // Search for issues using smart keyword matching
  private async searchSimilarIssues(
    projectKey: string,
    title: string,
    description: string
  ): Promise<any[]> {
    try {
      // Extract keywords from title and description
      const keywords = await this.extractKeywords(title, description);
      
      // Create search query
      const searchQuery = `project = "${projectKey}" AND (${keywords.map(k => `text ~ "${k}"`).join(' OR ')})`;

      const response = await fetch(`${this.mcpUrl}/api/jira/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          jql: searchQuery,
          maxResults: 20,
          fields: ['summary', 'description', 'status', 'priority', 'key']
        })
      });

      if (!response.ok) {
        // Fallback to simple search
        return await this.fallbackSearch(projectKey, title);
      }

      const data = await response.json();
      return data.issues || [];

    } catch (error) {
      console.error('Search similar issues failed:', error);
      return await this.fallbackSearch(projectKey, title);
    }
  }

  // Fallback search with simple text matching
  private async fallbackSearch(projectKey: string, title: string): Promise<any[]> {
    try {
      // Use first few words of title as search terms
      const titleWords = title.split(' ').slice(0, 3).join(' ');
      
      const response = await fetch(`${this.mcpUrl}/api/jira/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          query: `project:${projectKey} ${titleWords}`
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.issues || [];
      }
      
      return [];
    } catch (error) {
      return [];
    }
  }

  // Extract keywords using OpenAI
  private async extractKeywords(title: string, description: string): Promise<string[]> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `Extract 3-5 key search terms from the following issue title and description. 
            Focus on technical terms, feature names, component names, and important nouns.
            Return only the keywords as a JSON array of strings.
            Example: ["login", "authentication", "error", "user"]`
          },
          {
            role: 'user',
            content: `Title: ${title}\nDescription: ${description}`
          }
        ],
        max_tokens: 100,
        temperature: 0.3
      });

      const result = response.choices[0]?.message?.content;
      if (!result) return this.extractKeywordsFallback(title, description);

      try {
        const keywords = JSON.parse(result);
        return Array.isArray(keywords) ? keywords.slice(0, 5) : this.extractKeywordsFallback(title, description);
      } catch {
        return this.extractKeywordsFallback(title, description);
      }

    } catch (error) {
      return this.extractKeywordsFallback(title, description);
    }
  }

  // Fallback keyword extraction
  private extractKeywordsFallback(title: string, description: string): string[] {
    const text = (title + ' ' + description).toLowerCase();
    const words = text.split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !/^\d+$/.test(word)) // Remove pure numbers
      .slice(0, 5);
    
    return words.length > 0 ? words : ['issue'];
  }

  // Analyze similarity using AI
  private async analyzeIssueSimilarity(
    newIssue: { title: string; description: string },
    existingIssues: any[]
  ): Promise<SimilarIssue[]> {
    const results: SimilarIssue[] = [];
    
    // Process in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < existingIssues.length; i += batchSize) {
      const batch = existingIssues.slice(i, i + batchSize);
      const batchResults = await this.analyzeBatch(newIssue, batch);
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + batchSize < existingIssues.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return results
      .filter(result => result.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity);
  }

  // Analyze a batch of issues
  private async analyzeBatch(
    newIssue: { title: string; description: string },
    issueBatch: any[]
  ): Promise<SimilarIssue[]> {
    try {
      const prompt = `Compare the new issue with each existing issue and provide similarity scores.

NEW ISSUE:
Title: ${newIssue.title}
Description: ${newIssue.description}

EXISTING ISSUES:
${issueBatch.map((issue, index) => `
${index + 1}. Key: ${issue.key}
   Title: ${issue.fields.summary}
   Description: ${issue.fields.description || 'No description'}
   Status: ${issue.fields.status.name}
`).join('')}

For each existing issue, return similarity analysis as JSON array:
[
  {
    "issueIndex": 1,
    "similarity": 0.0-1.0,
    "reason": "brief explanation"
  }
]

Similarity guidelines:
- 0.9+: Nearly identical
- 0.7-0.89: Very similar, likely duplicate
- 0.5-0.69: Related but distinct
- 0.3-0.49: Some overlap
- 0.0-0.29: Different issues`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at analyzing Jira issue similarity. Provide accurate similarity scores and brief explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 600,
        temperature: 0.2
      });

      const aiResponse = response.choices[0]?.message?.content;
      if (!aiResponse) {
        return issueBatch.map(issue => this.createFallbackSimilarity(issue));
      }

      try {
        const analysisResults = JSON.parse(aiResponse);
        
        return issueBatch.map((issue, index) => {
          const analysis = analysisResults.find(a => a.issueIndex === index + 1) || 
            { similarity: 0.1, reason: 'Analysis failed' };
          
          return {
            key: issue.key,
            summary: issue.fields.summary,
            description: issue.fields.description || '',
            status: issue.fields.status.name,
            priority: issue.fields.priority?.name || 'Unknown',
            similarity: Math.min(Math.max(analysis.similarity || 0, 0), 1),
            reason: analysis.reason || 'AI analysis completed'
          };
        });
      } catch (parseError) {
        return issueBatch.map(issue => this.createFallbackSimilarity(issue));
      }

    } catch (error) {
      console.error('Batch analysis failed:', error);
      return issueBatch.map(issue => this.createFallbackSimilarity(issue));
    }
  }

  // Create fallback similarity result
  private createFallbackSimilarity(issue: any): SimilarIssue {
    return {
      key: issue.key,
      summary: issue.fields.summary,
      description: issue.fields.description || '',
      status: issue.fields.status.name,
      priority: issue.fields.priority?.name || 'Unknown',
      similarity: 0.1, // Low similarity as fallback
      reason: 'Unable to perform detailed analysis'
    };
  }

  // Generate recommendations based on analysis
  private generateRecommendations(similarIssues: SimilarIssue[]): string[] {
    const recommendations: string[] = [];

    if (similarIssues.length === 0) {
      recommendations.push('✅ No similar issues found. Safe to proceed.');
      return recommendations;
    }

    const highSimilarity = similarIssues.filter(issue => issue.similarity > 0.8);
    const mediumSimilarity = similarIssues.filter(issue => issue.similarity > 0.6 && issue.similarity <= 0.8);

    if (highSimilarity.length > 0) {
      recommendations.push('⚠️  High similarity detected! Consider these actions:');
      recommendations.push('   • Check if the existing issue can be updated instead');
      recommendations.push('   • Add a comment to the existing issue');
      recommendations.push('   • Create a subtask if this is a specific aspect');
    }

    if (mediumSimilarity.length > 0) {
      recommendations.push('💡 Related issues found. Consider:');
      recommendations.push('   • Linking issues if they are related');
      recommendations.push('   • Adding references in the description');
      recommendations.push('   • Ensuring the new issue adds unique value');
    }

    recommendations.push('📋 Review the similar issues below before proceeding.');
    return recommendations;
  }

  // Display analysis results to user
  async displayAnalysisResults(analysis: DuplicateAnalysis): Promise<boolean> {
    if (!analysis.hasPotentialDuplicates) {
      this.cliUtils.showSuccess('No potential duplicates found. Safe to proceed with creation.');
      return true;
    }

    this.cliUtils.term.yellow('\n⚠️  Potential duplicate issues detected!\n');

    // Show recommendations
    this.cliUtils.term.magenta('📋 Recommendations:\n');
    analysis.recommendations.forEach(rec => {
      this.cliUtils.term.yellow(`${rec}\n`);
    });

    // Show similar issues
    if (analysis.similarIssues.length > 0) {
      this.cliUtils.term.cyan('\n🔍 Similar Issues Found:\n');
      this.cliUtils.term.cyan('─'.repeat(80) + '\n');
      
      analysis.similarIssues.forEach((issue, index) => {
        const similarityPercent = (issue.similarity * 100).toFixed(1);
        this.cliUtils.term(`${index + 1}. [${issue.key}] ${issue.summary.substring(0, 50)}${issue.summary.length > 50 ? '...' : ''}\n`);
        this.cliUtils.term(`   Status: ${issue.status} | Priority: ${issue.priority} | Similarity: ${similarityPercent}%\n`);
        this.cliUtils.term.gray(`   Reason: ${issue.reason}\n`);
        this.cliUtils.term('\n');
      });
    }

    // Ask user what to do
    this.cliUtils.term.cyan('🤔 What would you like to do?\n');
    const options = [
      'Proceed with creation anyway',
      'Review similar issues in detail',
      'Cancel and investigate manually',
      'Modify the issue to be more specific'
    ];

    const choice = await this.cliUtils.showSelectionMenu('Choose an action:', options);

    switch (choice) {
      case 0: // Proceed anyway
        this.cliUtils.showInfo('Proceeding with issue creation...');
        return true;

      case 1: // Review similar issues
        await this.showDetailedIssueReview(analysis.similarIssues);
        return await this.cliUtils.confirm('Proceed with creation after review?');

      case 2: // Cancel
        this.cliUtils.showInfo('Issue creation cancelled for manual investigation.');
        return false;

      case 3: // Modify issue
        this.cliUtils.showInfo('Please restart the creation process with more specific details.');
        return false;

      default:
        return false;
    }
  }

  // Show detailed review of similar issues
  private async showDetailedIssueReview(similarIssues: SimilarIssue[]): Promise<void> {
    this.cliUtils.term.yellow('\n📄 Detailed Issue Review:\n');
    this.cliUtils.term.yellow('═'.repeat(80) + '\n');

    for (const [index, issue] of similarIssues.entries()) {
      this.cliUtils.term.cyan(`\n[${index + 1}/${similarIssues.length}] Issue: ${issue.key}\n`);
      this.cliUtils.term(`📝 Title: ${issue.summary}\n`);
      this.cliUtils.term(`📊 Status: ${issue.status}\n`);
      this.cliUtils.term(`⚡ Priority: ${issue.priority}\n`);
      this.cliUtils.term(`🎯 Similarity: ${(issue.similarity * 100).toFixed(1)}%\n`);
      this.cliUtils.term(`💭 Reason: ${issue.reason}\n`);
      
      if (issue.description && issue.description.trim()) {
        const truncatedDesc = issue.description.length > 200 
          ? issue.description.substring(0, 200) + '...'
          : issue.description;
        this.cliUtils.term(`📄 Description: ${truncatedDesc}\n`);
      }

      if (index < similarIssues.length - 1) {
        this.cliUtils.term.gray('\n─'.repeat(60));
        this.cliUtils.term.cyan('\nPress Enter to continue to next issue...');
        await this.cliUtils.term.inputField().promise;
        this.cliUtils.term('\n');
      }
    }

    this.cliUtils.term.yellow('\n═'.repeat(80) + '\n');
    this.cliUtils.term.green('Review completed!\n');
  }
}// features/duplicate-detection.ts - Smart duplicate detection for Step 16
import { OpenAI } from 'openai';
import fetch from 'node-fetch';
import { CLIUtils } from '../utils/cli-utils';
import { ErrorHandler, AppError, ErrorType } from '../utils/error-handler';

interface SimilarIssue {
  key: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  similarity: number;
  reason: string;
}

interface DuplicateAnalysis {
  hasPotentialDuplicates: boolean;
  similarIssues: SimilarIssue[];
  recommendations: string[];
}

interface JiraSearchResult {
  issues: Array<{
    key: string;
    fields: {
      summary: string;
      description?: string;
      status: { name: string };
      priority?: { name: string };
    };
  }>;
}

interface SearchResponse {
  issues?: Array<{
    key: string;
    fields: {
      summary: string;
      description?: string;
      status: { name: string };
      priority?: { name: string };
    };
  }>;
}

export class DuplicateDetectionService {
  private openai: OpenAI;
  private mcpUrl: string;
  private cliUtils: CLIUtils;
  private errorHandler: ErrorHandler;

  constructor(openaiKey: string, mcpUrl: string) {
    this.openai = new OpenAI({ apiKey: openaiKey });
    this.mcpUrl = mcpUrl;
    this.cliUtils = new CLIUtils();
    this.errorHandler = new ErrorHandler();
  }

  // Main duplicate detection method
  async checkForDuplicates(
    projectKey: string,
    title: string,
    description: string
  ): Promise<DuplicateAnalysis> {
    try {
      this.cliUtils.showInfo('🔍 Checking for similar issues...');
      
      // Step 1: Search for potentially similar issues
      const searchResults = await this.searchSimilarIssues(projectKey, title, description);
      
      if (searchResults.length === 0) {
        return {
          hasPotentialDuplicates: false,
          similarIssues: [],
          recommendations: ['✅ No similar issues found. Safe to proceed with creation.']
        };
      }

      // Step 2: Use AI to analyze similarity
      this.cliUtils.showInfo(`📊 Analyzing ${searchResults.length} potential matches...`);
      const analysisResults = await this.analyzeIssueSimilarity(
        { title, description },
        searchResults
      );

      // Step 3: Filter and rank results
      const significantMatches = analysisResults.filter(result => result.similarity > 0.6);

      return {
        hasPotentialDuplicates: significantMatches.length > 0,
        similarIssues: significantMatches,
        recommendations: this.generateRecommendations(significantMatches)
      };

    } catch (error) {
      await this.errorHandler.handleError(error, 'duplicate-detection');
      
      // Return safe fallback
      return {
        hasPotentialDuplicates: false,
        similarIssues: [],
        recommendations: ['⚠️ Unable to check for duplicates. Proceed with caution.']
      };
    }
  }

  // Search for issues using smart keyword matching
  private async searchSimilarIssues(
    projectKey: string,
    title: string,
    description: string
  ): Promise<any[]> {
    try {
      // Extract keywords from title and description
      const keywords = await this.extractKeywords(title, description);
      
      // Create search query
      const searchQuery = `project = "${projectKey}" AND (${keywords.map(k => `text ~ "${k}"`).join(' OR ')})`;

      const response = await fetch(`${this.mcpUrl}/api/jira/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          jql: searchQuery,
          maxResults: 20,
          fields: ['summary', 'description', 'status', 'priority', 'key']
        })
      });

      if (!response.ok) {
        // Fallback to simple search
        return await this.fallbackSearch(projectKey, title);
      }

      const data = await response.json() as SearchResponse;
      return data.issues || [];

    } catch (error) {
      console.error('Search similar issues failed:', error);
      return await this.fallbackSearch(projectKey, title);
    }
  }

  // Fallback search with simple text matching
  private async fallbackSearch(projectKey: string, title: string): Promise<any[]> {
    try {
      // Use first few words of title as search terms
      const titleWords = title.split(' ').slice(0, 3).join(' ');
      
      const response = await fetch(`${this.mcpUrl}/api/jira/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          query: `project:${projectKey} ${titleWords}`
        })
      });

      if (response.ok) {
        const data = await response.json() as SearchResponse;
        return data.issues || [];
      }
      
      return [];
    } catch (error) {
      return [];
    }
  }

  // Extract keywords using OpenAI
  private async extractKeywords(title: string, description: string): Promise<string[]> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `Extract 3-5 key search terms from the following issue title and description. 
            Focus on technical terms, feature names, component names, and important nouns.
            Return only the keywords as a JSON array of strings.
            Example: ["login", "authentication", "error", "user"]`
          },
          {
            role: 'user',
            content: `Title: ${title}\nDescription: ${description}`
          }
        ],
        max_tokens: 100,
        temperature: 0.3
      });

      const result = response.choices[0]?.message?.content;
      if (!result) return this.extractKeywordsFallback(title, description);

      try {
        const keywords = JSON.parse(result);
        return Array.isArray(keywords) ? keywords.slice(0, 5) : this.extractKeywordsFallback(title, description);
      } catch {
        return this.extractKeywordsFallback(title, description);
      }

    } catch (error) {
      return this.extractKeywordsFallback(title, description);
    }
  }

  // Fallback keyword extraction
  private extractKeywordsFallback(title: string, description: string): string[] {
    const text = (title + ' ' + description).toLowerCase();
    const words = text.split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !/^\d+$/.test(word)) // Remove pure numbers
      .slice(0, 5);
    
    return words.length > 0 ? words : ['issue'];
  }

  // Analyze similarity using AI
  private async analyzeIssueSimilarity(
    newIssue: { title: string; description: string },
    existingIssues: any[]
  ): Promise<SimilarIssue[]> {
    const results: SimilarIssue[] = [];
    
    // Process in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < existingIssues.length; i += batchSize) {
      const batch = existingIssues.slice(i, i + batchSize);
      const batchResults = await this.analyzeBatch(newIssue, batch);
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + batchSize < existingIssues.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return results
      .filter(result => result.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity);
  }

  // Analyze a batch of issues
  private async analyzeBatch(
    newIssue: { title: string; description: string },
    issueBatch: any[]
  ): Promise<SimilarIssue[]> {
    try {
      const prompt = `Compare the new issue with each existing issue and provide similarity scores.

NEW ISSUE:
Title: ${newIssue.title}
Description: ${newIssue.description}

EXISTING ISSUES:
${issueBatch.map((issue, index) => `
${index + 1}. Key: ${issue.key}
   Title: ${issue.fields.summary}
   Description: ${issue.fields.description || 'No description'}
   Status: ${issue.fields.status.name}
`).join('')}

For each existing issue, return similarity analysis as JSON array:
[
  {
    "issueIndex": 1,
    "similarity": 0.0-1.0,
    "reason": "brief explanation"
  }
]

Similarity guidelines:
- 0.9+: Nearly identical
- 0.7-0.89: Very similar, likely duplicate
- 0.5-0.69: Related but distinct
- 0.3-0.49: Some overlap
- 0.0-0.29: Different issues`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at analyzing Jira issue similarity. Provide accurate similarity scores and brief explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 600,
        temperature: 0.2
      });

      const aiResponse = response.choices[0]?.message?.content;
      if (!aiResponse) {
        return issueBatch.map(issue => this.createFallbackSimilarity(issue));
      }

      try {
        const analysisResults = JSON.parse(aiResponse);
        
        return issueBatch.map((issue, index) => {
          const analysis = analysisResults.find(a => a.issueIndex === index + 1) || 
            { similarity: 0.1, reason: 'Analysis failed' };
          
          return {
            key: issue.key,
            summary: issue.fields.summary,
            description: issue.fields.description || '',
            status: issue.fields.status.name,
            priority: issue.fields.priority?.name || 'Unknown',
            similarity: Math.min(Math.max(analysis.similarity || 0, 0), 1),
            reason: analysis.reason || 'AI analysis completed'
          };
        });
      } catch (parseError) {
        return issueBatch.map(issue => this.createFallbackSimilarity(issue));
      }

    } catch (error) {
      console.error('Batch analysis failed:', error);
      return issueBatch.map(issue => this.createFallbackSimilarity(issue));
    }
  }

  // Create fallback similarity result
  private createFallbackSimilarity(issue: any): SimilarIssue {
    return {
      key: issue.key,
      summary: issue.fields.summary,
      description: issue.fields.description || '',
      status: issue.fields.status.name,
      priority: issue.fields.priority?.name || 'Unknown',
      similarity: 0.1, // Low similarity as fallback
      reason: 'Unable to perform detailed analysis'
    };
  }

  // Generate recommendations based on analysis
  private generateRecommendations(similarIssues: SimilarIssue[]): string[] {
    const recommendations: string[] = [];

    if (similarIssues.length === 0) {
      recommendations.push('✅ No similar issues found. Safe to proceed.');
      return recommendations;
    }

    const highSimilarity = similarIssues.filter(issue => issue.similarity > 0.8);
    const mediumSimilarity = similarIssues.filter(issue => issue.similarity > 0.6 && issue.similarity <= 0.8);

    if (highSimilarity.length > 0) {
      recommendations.push('⚠️  High similarity detected! Consider these actions:');
      recommendations.push('   • Check if the existing issue can be updated instead');
      recommendations.push('   • Add a comment to the existing issue');
      recommendations.push('   • Create a subtask if this is a specific aspect');
    }

    if (mediumSimilarity.length > 0) {
      recommendations.push('💡 Related issues found. Consider:');
      recommendations.push('   • Linking issues if they are related');
      recommendations.push('   • Adding references in the description');
      recommendations.push('   • Ensuring the new issue adds unique value');
    }

    recommendations.push('📋 Review the similar issues below before proceeding.');
    return recommendations;
  }

  // Display analysis results to user
  async displayAnalysisResults(analysis: DuplicateAnalysis): Promise<boolean> {
    if (!analysis.hasPotentialDuplicates) {
      this.cliUtils.showSuccess('No potential duplicates found. Safe to proceed with creation.');
      return true;
    }

    this.cliUtils.term.yellow('\n⚠️  Potential duplicate issues detected!\n');

    // Show recommendations
    this.cliUtils.term.magenta('📋 Recommendations:\n');
    analysis.recommendations.forEach(rec => {
      this.cliUtils.term.yellow(`${rec}\n`);
    });

    // Show similar issues
    if (analysis.similarIssues.length > 0) {
      this.cliUtils.term.cyan('\n🔍 Similar Issues Found:\n');
      this.cliUtils.term.cyan('─'.repeat(80) + '\n');
      
      analysis.similarIssues.forEach((issue, index) => {
        const similarityPercent = (issue.similarity * 100).toFixed(1);
        this.cliUtils.term(`${index + 1}. [${issue.key}] ${issue.summary.substring(0, 50)}${issue.summary.length > 50 ? '...' : ''}\n`);
        this.cliUtils.term(`   Status: ${issue.status} | Priority: ${issue.priority} | Similarity: ${similarityPercent}%\n`);
        this.cliUtils.term.gray(`   Reason: ${issue.reason}\n`);
        this.cliUtils.term('\n');
      });
    }

    // Ask user what to do
    this.cliUtils.term.cyan('🤔 What would you like to do?\n');
    const options = [
      'Proceed with creation anyway',
      'Review similar issues in detail',
      'Cancel and investigate manually',
      'Modify the issue to be more specific'
    ];

    const choice = await this.cliUtils.showSelectionMenu('Choose an action:', options);

    switch (choice) {
      case 0: // Proceed anyway
        this.cliUtils.showInfo('Proceeding with issue creation...');
        return true;

      case 1: // Review similar issues
        await this.showDetailedIssueReview(analysis.similarIssues);
        return await this.cliUtils.confirm('Proceed with creation after review?');

      case 2: // Cancel
        this.cliUtils.showInfo('Issue creation cancelled for manual investigation.');
        return false;

      case 3: // Modify issue
        this.cliUtils.showInfo('Please restart the creation process with more specific details.');
        return false;

      default:
        return false;
    }
  }

  // Show detailed review of similar issues
  private async showDetailedIssueReview(similarIssues: SimilarIssue[]): Promise<void> {
    this.cliUtils.term.yellow('\n📄 Detailed Issue Review:\n');
    this.cliUtils.term.yellow('═'.repeat(80) + '\n');

    for (const [index, issue] of similarIssues.entries()) {
      this.cliUtils.term.cyan(`\n[${index + 1}/${similarIssues.length}] Issue: ${issue.key}\n`);
      this.cliUtils.term(`📝 Title: ${issue.summary}\n`);
      this.cliUtils.term(`📊 Status: ${issue.status}\n`);
      this.cliUtils.term(`⚡ Priority: ${issue.priority}\n`);
      this.cliUtils.term(`🎯 Similarity: ${(issue.similarity * 100).toFixed(1)}%\n`);
      this.cliUtils.term(`💭 Reason: ${issue.reason}\n`);
      
      if (issue.description && issue.description.trim()) {
        const truncatedDesc = issue.description.length > 200 
          ? issue.description.substring(0, 200) + '...'
          : issue.description;
        this.cliUtils.term(`📄 Description: ${truncatedDesc}\n`);
      }

      if (index < similarIssues.length - 1) {
        this.cliUtils.term.gray('\n─'.repeat(60));
        this.cliUtils.term.cyan('\nPress Enter to continue to next issue...');
        await this.cliUtils.term.inputField().promise;
        this.cliUtils.term('\n');
      }
    }

    this.cliUtils.term.yellow('\n═'.repeat(80) + '\n');
    this.cliUtils.term.green('Review completed!\n');
  }
}