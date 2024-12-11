import { Debugger } from 'debug';
import debug from 'debug';
import { Book } from './types';
import { BookSummary } from './schema/summarySchema';
import { createBookTranslator, BookTranslatorWithHistory } from './translator';
import { TypeChatLanguageModel } from 'typechat';
import pLimit from 'p-limit';

const log: Debugger = debug('book-ai:summarizer');

export class BookSummarizer {
    private book: Book;
    private summary: BookSummary | null = null;
    private translator: BookTranslatorWithHistory;
    private concurrencyLimit: number;

    constructor(
        book: Book,
        model: TypeChatLanguageModel,
        schema: string,
        concurrencyLimit: number = 75
    ) {
        this.book = book;
        this.concurrencyLimit = concurrencyLimit;
        
        const instructions = `
Focus on:
- Writing style analysis (narrative techniques, language use, literary devices)
- Tone and mood identification
- Key plot points and significant events
- Character development and interactions
- Themes and motifs
- Quality issues (orthography, grammar, plot inconsistencies). If no issues are found, return an empty array.
Maintain consistency in analysis across sections.`;

        this.translator = createBookTranslator(model, schema, instructions);
    }

    async summarizeSections(): Promise<BookSummary> {
        log('Starting section summarization');
        const limit = pLimit(this.concurrencyLimit);
        
        const summaryPromises = this.book.sections.map((section, index) => 
            limit(async () => {
                log(`Summarizing section ${index + 1}/${this.book.sections.length}: ${section.title}`);
                
                const prompt = `
Title: ${section.title}
Content: ${section.content}`;

                const result = await this.translator.translate(prompt);
                
                if (!result.success) {
                    log(`Failed to summarize section ${section.title}: ${result.message}`);
                    throw new Error(`Failed to summarize section ${index}: ${result.message}`);
                }

                log(`Successfully summarized section: ${section.title}`);
                return {
                    ...result.data,
                    title: section.title
                };
            })
        );

        try {
            const summaries = await Promise.all(summaryPromises);
            this.summary = { sections: summaries };
            return this.summary;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(`Summarization failed: ${errorMessage}`);
            throw new Error(`Summarization failed: ${errorMessage}`);
        }
    }

    getSummary(): BookSummary | null {
        return this.summary;
    }
}
