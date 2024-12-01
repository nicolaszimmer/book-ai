import { Debugger } from 'debug';
import debug from 'debug';
import { createLanguageModel } from 'typechat';
import { BookLoader } from './loader';
import { BookSummarizer } from './summarizer';
import { SummariesAnalyzer, ComprehensiveSummary } from './summariesAnalyzer';
import { Book } from './types';
import { BookSummary } from './schema/summarySchema';

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
}
`;

export class BookAI {
    private openAIModel;
    private schema: string;
    private book: Book | null = null;
    private summarizer: BookSummarizer | null = null;
    private anthropicApiKey: string;
    private anthropicModel: string;

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
        return await this.summarizer.summarizeSections();
    }

    async analyze(): Promise<ComprehensiveSummary> {
        log('Analyzing summaries');
        if (!this.book || !this.summarizer) {
            throw new Error('No book loaded. Call load() first.');
        }

        const summaries = await this.getSectionSummaries();
        const analyzer = new SummariesAnalyzer(this.anthropicApiKey, this.anthropicModel);
        return await analyzer.analyze(summaries);
    }

    getBook(): Book | null {
        return this.book;
    }
}

export type { Book, BookSection } from './types';
export type { BookSummary, SectionSummary } from './schema/summarySchema';
export type { BookAIConfig, ComprehensiveSummary }
export default BookAI;