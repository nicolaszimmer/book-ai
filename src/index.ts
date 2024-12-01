import { Debugger } from 'debug';
import debug from 'debug';
import { createLanguageModel } from 'typechat';
import { BookLoader } from './loader';
import { BookSummarizer } from './summarizer';
import fs from 'fs';
import path from 'path';
import { Book } from './types';
import { BookSummary } from './schema/summarySchema';

const log: Debugger = debug('book-ai:main');

export class BookAI {
    private model;
    private schema: string;
    private book: Book | null = null;
    private summarizer: BookSummarizer | null = null;

    constructor(openAIKey: string, modelName: string = 'gpt-3.5-turbo') {
        log('Initializing BookAI');
        
        if (!openAIKey) {
            throw new Error('OpenAI API key is required');
        }

        this.model = createLanguageModel({ 
            OPENAI_API_KEY: openAIKey,
            OPENAI_MODEL: modelName
        });
        
        const schemaPath = path.join(__dirname, 'schema', 'summarySchema.ts');
        this.schema = fs.readFileSync(schemaPath, 'utf8');
        
        log('BookAI initialized');
    }

    load(content: string | [string, string][] | Map<string, string>): Book {
        log('Loading book content');
        this.book = BookLoader.load(content);
        this.summarizer = new BookSummarizer(
            this.book, 
            this.model, 
            this.schema
        );
        log(`Loaded book with ${this.book.sections.length} sections`);
        return this.book;
    }

    async summarizeSections(): Promise<BookSummary> {
        log('Starting section summarization');
        if (!this.book || !this.summarizer) {
            throw new Error('No book loaded. Call load() first.');
        }
        return await this.summarizer.summarizeSections();
    }

    getBook(): Book | null {
        return this.book;
    }
}

export type { Book, BookSection } from './types';
export type { BookSummary, SectionSummary } from './schema/summarySchema';
export default BookAI;
