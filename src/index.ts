import { Debugger } from 'debug';
import debug from 'debug';
import { createLanguageModel } from 'typechat';
import { BookLoader } from './loader';
import { BookSummarizer } from './summarizer';
import { SummariesAnalyzer, ComprehensiveSummary } from './summariesAnalyzer';
import { SummaryChat, ChatRequest, ChatHistoryEntry, ExportedHistory } from './summaryChat';
import { Book } from './types';
import { BookSummary, SectionSummary } from './schema/summarySchema';
import { SampleSelector } from './sampleSelector';

const log: Debugger = debug('book-ai:main');

interface BookAIConfig {
    openAIApiKey: string;
    openAIModel?: string;
    anthropicApiKey: string;
    anthropicModel?: string;
    schema?: string; // Make schema optional in config
}

const DEFAULT_SCHEMA = `
export interface SectionSummary {
    title: string;           
    summary: string;         
    writingStyle: string;    
    tonality: string;        
    keyEvents: string[];
    qualityIssues: string[];     
}
`;

export class BookAI {
    private openAIModel;
    private schema: string;
    private book: Book | null = null;
    private summarizer: BookSummarizer | null = null;
    private anthropicApiKey: string;
    private anthropicModel: string;
    private comprehensiveSummary: ComprehensiveSummary | null = null;
    private summaryChat: SummaryChat | null = null;
    private bookSummary: BookSummary | null = null;

    constructor(config: BookAIConfig) {
        log('Initializing BookAI');
        
        if (!config.openAIApiKey || !config.anthropicApiKey) {
            throw new Error('Both OpenAI and Anthropic API keys are required');
        }

        this.openAIModel = createLanguageModel({ 
            OPENAI_API_KEY: config.openAIApiKey,
            OPENAI_MODEL: config.openAIModel || 'gpt-3.5-turbo'
        });
        
        this.anthropicApiKey = config.anthropicApiKey;
        this.anthropicModel = config.anthropicModel || 'claude-3-5-sonnet-20241022';
        
        // Use provided schema or default
        this.schema = config.schema || DEFAULT_SCHEMA;
        
        log('BookAI initialized');
    }

    // Rest of the class implementation stays the same
    load(content: string | [string, string][] | Map<string, string>): Book {
        log('Loading book content');
        this.book = BookLoader.load(content);
        this.summarizer = new BookSummarizer(
            this.book, 
            this.openAIModel,
            this.schema
        );
        log(`Loaded book with ${this.book.sections.length} sections`);
        return this.book;
    }

    async getSectionSummaries(): Promise<BookSummary> {
        log('Getting section summaries');
        if (!this.book || !this.summarizer) {
            throw new Error('No book loaded. Call load() first.');
        }
        this.bookSummary = await this.summarizer.summarizeSections()
        return this.bookSummary;
    }

    async analyze(): Promise<ComprehensiveSummary> {
        log('Analyzing summaries');
        if (!this.book || !this.summarizer) {
            throw new Error('No book loaded. Call load() first.');
        }

        const summaries = this.bookSummary ||  await this.getSectionSummaries();
        const analyzer = new SummariesAnalyzer(this.anthropicApiKey, this.anthropicModel);
        this.comprehensiveSummary = await analyzer.analyze(summaries);
        return this.comprehensiveSummary;
    }

    loadSummary(summary: ComprehensiveSummary): void {
        log('Loading existing comprehensive summary');
        this.comprehensiveSummary = summary;
    }

    async refineSection(request: ChatRequest): Promise<ComprehensiveSummary> {
        log(`Refining section: ${request.section}`);
        
        if (!this.comprehensiveSummary) {
            throw new Error('No summary available. Call analyze() or loadSummary() first.');
        }

        if (!this.summaryChat) {
            this.summaryChat = new SummaryChat(
                this.anthropicApiKey,
                this.anthropicModel,
                this.comprehensiveSummary
            );
        }

        const updatedSummary = await this.summaryChat.refineSection(request);
        this.comprehensiveSummary = updatedSummary;
        return updatedSummary;
    }

    getSummary(): ComprehensiveSummary | null {
        return this.comprehensiveSummary;
    }

    getBook(): Book | null {
        return this.book;
    }

    exportHistory(): ExportedHistory | null {
        if (!this.summaryChat) {
            log('No chat history available');
            return null;
        }
        return this.summaryChat.exportHistory();
    }

    importHistory(history: ExportedHistory): void {
        log('Importing chat history');
        if (!this.comprehensiveSummary) {
            throw new Error('No summary available. Call analyze() or loadSummary() first.');
        }

        if (!this.summaryChat) {
            this.summaryChat = new SummaryChat(
                this.anthropicApiKey,
                this.anthropicModel,
                this.comprehensiveSummary
            );
        }

        this.summaryChat.importHistory(history);
        // Update our stored summary with the imported current state
        this.comprehensiveSummary = this.summaryChat.getSummary();
    }

    revertToTimestamp(timestamp: string): ComprehensiveSummary {
        if (!this.summaryChat) {
            throw new Error('No chat history available');
        }
        const revertedSummary = this.summaryChat.revertToTimestamp(timestamp);
        this.comprehensiveSummary = revertedSummary;
        return revertedSummary;
    }

    revertLastChange(): ComprehensiveSummary {
        if (!this.summaryChat) {
            throw new Error('No chat history available');
        }
        const revertedSummary = this.summaryChat.revertLastChange();
        this.comprehensiveSummary = revertedSummary;
        return revertedSummary;
    }

    resetToInitial(): ComprehensiveSummary {
        if (!this.summaryChat) {
            throw new Error('No chat history available');
        }
        const initialSummary = this.summaryChat.reset();
        this.comprehensiveSummary = initialSummary;
        return initialSummary;
    }

    getChatHistory(): ChatHistoryEntry[] {
        if (!this.summaryChat) {
            return [];
        }
        return this.summaryChat.getHistory();
    }
}

// Export types and classes
export type {
    Book,
    BookSection
} from './types';

export type {
    BookSummary,
    SectionSummary
} from './schema/summarySchema';

export type {
    BookAIConfig,
    ComprehensiveSummary,
    ChatRequest,
    ChatHistoryEntry,
    ExportedHistory
};

export { SummaryChat, SampleSelector };
export default BookAI;