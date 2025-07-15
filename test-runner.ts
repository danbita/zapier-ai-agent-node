// test-runner.ts - Comprehensive testing implementation for Jira AI Agent
import { CLIUtils } from './utils/cli-utils';
import { ErrorHandler, AppError, ErrorType } from './utils/error-handler';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export class JiraAgentTester {
  private cliUtils: CLIUtils;
  private errorHandler: ErrorHandler;
  private mcpUrl: string;
  private testResults: TestResult[] = [];

  constructor() {
    this.cliUtils = new CLIUtils();
    this.errorHandler = new ErrorHandler();
    this.mcpUrl = process.env.ZAPIER_MCP_URL || '';
  }

  async runAllTests(): Promise<void> {
    this.cliUtils.showHeader();
    this.cliUtils.term.bold.cyan('🧪 Running Jira Agent Comprehensive Tests\n\n');

    const tests = [
      { name: 'Environment Configuration', fn: () => this.testEnvironmentSetup() },
      { name: 'Zapier MCP Connection', fn: () => this.testMCPConnection() },
      { name: 'Project Fetching', fn: () => this.testProjectFetching() },
      { name: 'Issue Type Fetching', fn: () => this.testIssueTypeFetching() },
      { name: 'Issue Creation API', fn: () => this.testIssueCreationAPI() },
      { name: 'Issue Search API', fn: () => this.testIssueSearch() },
      { name: 'Error Handling Logic', fn: () => this.testErrorHandling() },
      { name: 'Input Validation', fn: () => this.testInputValidation() },
      { name: 'OpenAI Integration', fn: () => this.testOpenAIIntegration() },
      { name: 'Duplicate Detection', fn: () => this.testDuplicateDetection() }
    ];

    for (const test of tests) {
      await this.runTest(test.name, test.fn);
      // Small delay between tests for readability
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.displayTestResults();
  }

  private async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    this.cliUtils.term.yellow(`📋 Testing: ${name}... `);
    const startTime = Date.now();
    
    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.testResults.push({ name, passed: true, duration });
      this.cliUtils.term.green('✅ PASSED\n');
    } catch (error) {
      const duration = Date.now() - startTime;
      this.testResults.push({ 
        name, 
        passed: false, 
        error: error.message,
        duration 
      });
      this.cliUtils.term.red('❌ FAILED\n');
      this.cliUtils.term.red(`   Error: ${error.message}\n`);
    }
  }

  // Test 1: Environment Setup Validation
  private async testEnvironmentSetup(): Promise<void> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not found in environment variables');
    }

    if (!process.env.ZAPIER_MCP_URL) {
      throw new Error('ZAPIER_MCP_URL not found in environment variables');
    }

    if (!process.env.OPENAI_API_KEY.startsWith('sk-')) {
      throw new Error('OPENAI_API_KEY appears to be invalid format (should start with sk-)');
    }

    if (!process.env.ZAPIER_MCP_URL.startsWith('http')) {
      throw new Error('ZAPIER_MCP_URL appears to be invalid format (should start with http)');
    }

    // Check if required modules can be imported
    try {
      const { OpenAI } = require('openai');
      const terminal = require('terminal-kit');
      const fetch = require('node-fetch');
      
      if (!OpenAI || !terminal || !fetch) {
        throw new Error('Required dependencies not properly installed');
      }
    } catch (error) {
      throw new Error(`Dependency check failed: ${error.message}`);
    }
  }

  // Test 2: Zapier MCP Connection
  private async testMCPConnection(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${this.mcpUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Jira-AI-Agent/1.0'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`MCP health check failed: ${response.status} ${response.statusText}`);
      }

      // Try to parse response if it's JSON
      try {
        const healthData = await response.json();
        if (healthData.status && healthData.status !== 'ok') {
          throw new Error(`MCP service unhealthy: ${healthData.status}`);
        }
      } catch (parseError) {
        // If not JSON, that's often still okay for a health check
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('MCP connection timeout - check URL and network connection');
      }
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to Zapier MCP - verify URL and service availability');
      }
      if (error.code === 'ENOTFOUND') {
        throw new Error('Zapier MCP URL not found - check DNS or URL spelling');
      }
      throw error;
    }
  }

  // Test 3: Project Fetching
  private async testProjectFetching(): Promise<void> {
    const response = await fetch(`${this.mcpUrl}/api/jira/projects`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'User-Agent': 'Jira-AI-Agent/1.0'
      },
      timeout: 15000
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Projects API failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.projects || !Array.isArray(data.projects)) {
      throw new Error('Projects API returned invalid data structure (expected {projects: [...]}');
    }

    if (data.projects.length === 0) {
      throw new Error('No projects found - check Jira permissions and integration setup');
    }

    // Validate project structure
    const firstProject = data.projects[0];
    if (!firstProject.key || !firstProject.name) {
      throw new Error('Project data missing required fields (key, name)');
    }

    // Test that we can access at least one project
    if (typeof firstProject.key !== 'string' || firstProject.key.length === 0) {
      throw new Error('Project key is invalid');
    }
  }

  // Test 4: Issue Type Fetching
  private async testIssueTypeFetching(): Promise<void> {
    // First get a project to test with
    const projectsResponse = await fetch(`${this.mcpUrl}/api/jira/projects`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    const projectsData = await projectsResponse.json();
    if (!projectsData.projects || projectsData.projects.length === 0) {
      throw new Error('No projects available for testing issue types');
    }

    const testProject = projectsData.projects[0];

    // Test issue types API
    const response = await fetch(`${this.mcpUrl}/api/jira/issue-types`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({ projectKey: testProject.key }),
      timeout: 15000
    });

    if (!response.ok) {
      // This endpoint might not exist in all MCP setups, so we'll just warn
      console.warn('Issue types API not available - will use defaults');
      return;
    }

    const data = await response.json();
    if (data.issueTypes && !Array.isArray(data.issueTypes)) {
      throw new Error('Issue types API returned invalid data structure');
    }
  }

  // Test 5: Issue Creation API
  private async testIssueCreationAPI(): Promise<void> {
    // Get a test project first
    const projectsResponse = await fetch(`${this.mcpUrl}/api/jira/projects`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    const projectsData = await projectsResponse.json();
    if (!projectsData.projects || projectsData.projects.length === 0) {
      throw new Error('No projects available for testing issue creation');
    }

    const testProject = projectsData.projects[0];
    const testIssue = {
      projectKey: testProject.key,
      issueType: 'Task',
      summary: `[TEST] Jira Agent Test Issue - ${new Date().toISOString()}`,
      description: 'This is a test issue created by the Jira Agent test suite. It can be safely deleted.',
      priority: 'Low'
    };

    const response = await fetch(`${this.mcpUrl}/api/jira/create-issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(testIssue),
      timeout: 20000
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Issue creation failed: ${response.status} - ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    if (!data.key) {
      throw new Error('Issue creation succeeded but no issue key returned');
    }

    console.log(`   ℹ️  Test issue created: ${data.key}`);
  }

  // Test 6: Issue Search
  private async testIssueSearch(): Promise<void> {
    const response = await fetch(`${this.mcpUrl}/api/jira/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({ 
        query: 'test',
        maxResults: 5 
      }),
      timeout: 15000
    });

    if (!response.ok) {
      throw new Error(`Search API failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.issues || !Array.isArray(data.issues)) {
      throw new Error('Search API returned invalid data structure');
    }

    // Validate issue structure if any issues returned
    if (data.issues.length > 0) {
      const firstIssue = data.issues[0];
      if (!firstIssue.key || !firstIssue.fields) {
        throw new Error('Search returned issues with invalid structure');
      }
    }
  }

  // Test 7: Error Handling Logic
  private async testErrorHandling(): Promise<void> {
    // Test network error handling
    try {
      await fetch('http://nonexistent-url-12345.com', { timeout: 1000 });
    } catch (error) {
      const appError = this.errorHandler['normalizeError'](error);
      if (appError.type !== ErrorType.NETWORK_ERROR) {
        throw new Error('Network error not properly classified');
      }
    }

    // Test authentication error
    const authError = new Error('401 Unauthorized');
    const normalizedAuthError = this.errorHandler['normalizeError'](authError);
    if (normalizedAuthError.type !== ErrorType.AUTHENTICATION_ERROR) {
      throw new Error('Auth error not properly classified');
    }

    // Test Jira API error
    const jiraError = new Error('400 Bad Request');
    const normalizedJiraError = this.errorHandler['normalizeError'](jiraError);
    if (normalizedJiraError.type !== ErrorType.JIRA_API_ERROR) {
      throw new Error('Jira API error not properly classified');
    }

    // Test custom error creation
    const customError = new AppError('Test error', ErrorType.VALIDATION_ERROR, false);
    if (customError.type !== ErrorType.VALIDATION_ERROR || customError.isRetryable !== false) {
      throw new Error('Custom AppError not working correctly');
    }
  }

  // Test 8: Input Validation
  private async testInputValidation(): Promise<void> {
    const validators = CLIUtils.validators;

    // Test required validator
    if (validators.required('test') !== true) {
      throw new Error('Required validator failed for valid input');
    }
    if (typeof validators.required('') !== 'string') {
      throw new Error('Required validator failed for empty input');
    }
    if (typeof validators.required('   ') !== 'string') {
      throw new Error('Required validator failed for whitespace input');
    }

    // Test min length validator
    const minLength5 = validators.minLength(5);
    if (minLength5('12345') !== true) {
      throw new Error('MinLength validator failed for valid input');
    }
    if (typeof minLength5('123') !== 'string') {
      throw new Error('MinLength validator failed for short input');
    }

    // Test max length validator
    const maxLength10 = validators.maxLength(10);
    if (maxLength10('12345') !== true) {
      throw new Error('MaxLength validator failed for valid input');
    }
    if (typeof maxLength10('12345678901') !== 'string') {
      throw new Error('MaxLength validator failed for long input');
    }

    // Test email validator
    if (validators.email('test@example.com') !== true) {
      throw new Error('Email validator failed for valid email');
    }
    if (typeof validators.email('invalid-email') !== 'string') {
      throw new Error('Email validator failed for invalid email');
    }

    // Test number validator
    if (validators.number('123') !== true) {
      throw new Error('Number validator failed for valid number');
    }
    if (typeof validators.number('abc') !== 'string') {
      throw new Error('Number validator failed for non-number');
    }

    // Test range validator
    const range1to10 = validators.range(1, 10);
    if (range1to10('5') !== true) {
      throw new Error('Range validator failed for valid input');
    }
    if (typeof range1to10('15') !== 'string') {
      throw new Error('Range validator failed for out-of-range input');
    }
    if (typeof range1to10('0') !== 'string') {
      throw new Error('Range validator failed for below-range input');
    }
  }

  // Test 9: OpenAI Integration
  private async testOpenAIIntegration(): Promise<void> {
    try {
      const { OpenAI } = require('openai');
      const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY 
      });

      // Test a simple completion
      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a test assistant. Respond with exactly: "TEST_SUCCESSFUL"'
          },
          {
            role: 'user',
            content: 'Test'
          }
        ],
        max_tokens: 10,
        temperature: 0
      });

      const result = response.choices[0]?.message?.content?.trim();
      if (!result || !result.includes('TEST_SUCCESSFUL')) {
        throw new Error(`OpenAI test failed: unexpected response: ${result}`);
      }

    } catch (error) {
      if (error.message.includes('API key')) {
        throw new Error('OpenAI API key is invalid or expired');
      }
      if (error.message.includes('quota')) {
        throw new Error('OpenAI API quota exceeded');
      }
      throw new Error(`OpenAI integration failed: ${error.message}`);
    }
  }

  // Test 10: Duplicate Detection Logic
  private async testDuplicateDetection(): Promise<void> {
    try {
      const { DuplicateDetectionService } = require('./features/duplicate-detection');
      
      const duplicateService = new DuplicateDetectionService(
        process.env.OPENAI_API_KEY,
        this.mcpUrl
      );

      // Test keyword extraction
      const keywords = await duplicateService['extractKeywords'](
        'Login authentication error',
        'Users cannot authenticate when trying to log in to the system'
      );

      if (!Array.isArray(keywords) || keywords.length === 0) {
        throw new Error('Keyword extraction failed');
      }

      // Test that we get reasonable keywords
      const hasRelevantKeyword = keywords.some(keyword => 
        ['login', 'auth', 'authentication', 'error', 'user'].includes(keyword.toLowerCase())
      );

      if (!hasRelevantKeyword) {
        console.warn('Keywords may not be optimal:', keywords);
      }

    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new Error('Duplicate detection module not found');
      }
      throw new Error(`Duplicate detection test failed: ${error.message}`);
    }
  }

  private displayTestResults(): void {
    this.cliUtils.term('\n');
    this.cliUtils.term.bold.cyan('📊 Test Results Summary\n');
    this.cliUtils.term.cyan('═'.repeat(70) + '\n');

    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    const totalTime = this.testResults.reduce((sum, r) => sum + r.duration, 0);

    this.cliUtils.term(`📈 Total Tests: ${this.testResults.length}\n`);
    this.cliUtils.term.green(`✅ Passed: ${passed}\n`);
    this.cliUtils.term.red(`❌ Failed: ${failed}\n`);
    this.cliUtils.term(`⏱️  Total Time: ${totalTime}ms\n`);
    this.cliUtils.term(`📊 Success Rate: ${((passed / this.testResults.length) * 100).toFixed(1)}%\n\n`);

    // Show detailed results
    this.cliUtils.term.bold('📋 Detailed Results:\n');
    this.testResults.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      const duration = `(${result.duration}ms)`;
      this.cliUtils.term(`${status} ${result.name.padEnd(25)} ${duration}\n`);
      
      if (!result.passed && result.error) {
        this.cliUtils.term.red(`   └─ ${result.error}\n`);
      }
    });

    this.cliUtils.term('\n');
    
    if (failed === 0) {
      this.cliUtils.showSuccess('🎉 All tests passed! Your Jira Agent is ready to use.');
      this.cliUtils.term.green('Run `yarn start` to begin using the agent.\n');
    } else {
      this.cliUtils.showError(`🔧 ${failed} test(s) failed. Please check the configuration and resolve issues.`);
      
      // Show specific guidance based on failed tests
      const failedTests = this.testResults.filter(r => !r.passed);
      this.cliUtils.term.yellow('\n💡 Troubleshooting suggestions:\n');
      
      failedTests.forEach(test => {
        if (test.name.includes('Environment')) {
          this.cliUtils.term.yellow('   • Check your .env file configuration\n');
        }
        if (test.name.includes('MCP Connection')) {
          this.cliUtils.term.yellow('   • Verify Zapier MCP URL and service status\n');
        }
        if (test.name.includes('OpenAI')) {
          this.cliUtils.term.yellow('   • Check OpenAI API key and quota\n');
        }
        if (test.name.includes('Jira') || test.name.includes('Project')) {
          this.cliUtils.term.yellow('   • Verify Jira integration in Zapier MCP\n');
        }
      });
    }
  }
}

// Quick test runner for immediate feedback
export class QuickTester {
  private cliUtils: CLIUtils;

  constructor() {
    this.cliUtils = new CLIUtils();
  }

  async testBasicSetup(): Promise<boolean> {
    this.cliUtils.term.yellow('🔍 Quick Setup Test...\n');

    try {
      // Test environment variables
      if (!process.env.OPENAI_API_KEY) {
        this.cliUtils.showError('Missing OPENAI_API_KEY in .env file');
        this.cliUtils.term.yellow('   Add your OpenAI API key to .env file\n');
        return false;
      }

      if (!process.env.ZAPIER_MCP_URL) {
        this.cliUtils.showError('Missing ZAPIER_MCP_URL in .env file');
        this.cliUtils.term.yellow('   Add your Zapier MCP URL to .env file\n');
        return false;
      }

      this.cliUtils.showSuccess('Environment variables configured correctly');

      // Test basic connectivity
      this.cliUtils.term.yellow('📡 Testing connection to Zapier MCP...\n');
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(process.env.ZAPIER_MCP_URL + '/health', {
          method: 'GET',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          this.cliUtils.showSuccess('Connection to Zapier MCP successful');
        } else {
          this.cliUtils.showWarning(`Zapier MCP responded with status ${response.status} - may need configuration`);
        }
        
        return true;
        
      } catch (error) {
        if (error.name === 'AbortError') {
          this.cliUtils.showWarning('Connection to Zapier MCP timed out - check URL and network');
        } else {
          this.cliUtils.showWarning('Cannot reach Zapier MCP - please check your configuration');
        }
        return false;
      }

    } catch (error) {
      this.cliUtils.showError(`Setup test failed: ${error.message}`);
      return false;
    }
  }
}

// Performance benchmark runner
export class PerformanceTester {
  private cliUtils: CLIUtils;

  constructor() {
    this.cliUtils = new CLIUtils();
  }

  async runPerformanceTests(): Promise<void> {
    this.cliUtils.term.bold.cyan('⚡ Performance Tests\n\n');

    // Test API response times
    await this.testAPIResponseTimes();
    
    // Test memory usage
    await this.testMemoryUsage();
    
    // Test concurrent operations
    await this.testConcurrentOperations();
  }

  private async testAPIResponseTimes(): Promise<void> {
    const tests = [
      { name: 'Projects API', url: '/api/jira/projects' },
      { name: 'Health Check', url: '/health' }
    ];

    for (const test of tests) {
      const startTime = Date.now();
      try {
        const response = await fetch(process.env.ZAPIER_MCP_URL + test.url, {
          timeout: 10000
        });
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (response.ok) {
          this.cliUtils.term.green(`✅ ${test.name}: ${duration}ms\n`);
        } else {
          this.cliUtils.term.yellow(`⚠️  ${test.name}: ${duration}ms (status: ${response.status})\n`);
        }
      } catch (error) {
        this.cliUtils.term.red(`❌ ${test.name}: failed (${error.message})\n`);
      }
    }
  }

  private async testMemoryUsage(): Promise<void> {
    const used = process.memoryUsage();
    this.cliUtils.term.cyan('\n📊 Memory Usage:\n');
    this.cliUtils.term(`   RSS: ${Math.round(used.rss / 1024 / 1024)} MB\n`);
    this.cliUtils.term(`   Heap Used: ${Math.round(used.heapUsed / 1024 / 1024)} MB\n`);
    this.cliUtils.term(`   Heap Total: ${Math.round(used.heapTotal / 1024 / 1024)} MB\n`);
  }

  private async testConcurrentOperations(): Promise<void> {
    this.cliUtils.term.cyan('\n🔄 Testing concurrent operations...\n');
    
    const startTime = Date.now();
    const promises = Array(5).fill(null).map(() => 
      fetch(process.env.ZAPIER_MCP_URL + '/health', { timeout: 5000 })
    );
    
    try {
      await Promise.all(promises);
      const duration = Date.now() - startTime;
      this.cliUtils.term.green(`✅ 5 concurrent requests completed in ${duration}ms\n`);
    } catch (error) {
      this.cliUtils.term.red(`❌ Concurrent operations failed: ${error.message}\n`);
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--quick')) {
    const quickTester = new QuickTester();
    quickTester.testBasicSetup().then(success => {
      process.exit(success ? 0 : 1);
    });
  } else if (args.includes('--performance')) {
    const perfTester = new PerformanceTester();
    perfTester.runPerformanceTests().catch(console.error);
  } else {
    const tester = new JiraAgentTester();
    tester.runAllTests().catch(console.error);
  }
}