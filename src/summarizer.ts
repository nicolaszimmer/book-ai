import { Debugger } from 'debug';
import debug from 'debug';
import { Book } from './types';
import { TypeChatLanguageModel } from 'typechat';
import OpenAI from 'openai';
import pLimit from 'p-limit';
import { BookSummary, SectionSummary, ModerationResult } from './schema/summarySchema';
import { createBookTranslator, BookTranslatorWithHistory } from './translator';

const log: Debugger = debug('book-ai:summarizer');

export class BookSummarizer {
    private book: Book;
    private summary: BookSummary | null = null;
    private translator: BookTranslatorWithHistory;
    private concurrencyLimit: number;
    private openai: OpenAI | null = null;
    private enableModeration: boolean;

    constructor(
        book: Book,
        model: TypeChatLanguageModel,
        schema: string,
        options: {
            openaiApiKey?: string,
            concurrencyLimit?: number,
            enableModeration?: boolean
        } = {}
    ) {
        const {
            openaiApiKey,
            concurrencyLimit = 75,
            enableModeration = false
        } = options;

        this.book = book;
        this.concurrencyLimit = concurrencyLimit;
        this.enableModeration = enableModeration;
        
        if (enableModeration) {
            if (!openaiApiKey) {
                throw new Error('OpenAI API key is required when moderation is enabled');
            }
            this.openai = new OpenAI({ apiKey: openaiApiKey });
        }
        
        const instructions = `
Focus on:
- Writing style analysis (narrative techniques, language use, literary devices)
- Tone and mood identification
- Key plot points and significant events
- Character development and interactions
- Themes and motifs
- Quality issues (orthography, grammar, plot inconsistencies); if no issues were found, return an empty array.
Maintain consistency in analysis across sections.`;

        this.translator = createBookTranslator(model, schema, instructions);
    }

    private async getModerationResult(text: string): Promise<ModerationResult | null> {
        if (!this.enableModeration || !this.openai) {
            return null;
        }

        try {
            const moderation = await this.openai.moderations.create({
                model: "text-moderation-latest",
                input: text,
            });
            
            return {
                flagged: moderation.results[0].flagged,
                categories: moderation.results[0].categories,
                categoryScores: moderation.results[0].category_scores
            };
        } catch (error) {
            log(`Moderation check failed: ${error}`);
            throw new Error(`Moderation check failed: ${error}`);
        }
    }

    async summarizeSections(): Promise<BookSummary> {
        log('Starting section summarization');
        const limit = pLimit(this.concurrencyLimit);
        
        const summaryPromises = this.book.sections.map((section, index) => 
            limit(async () => {
                log(`Processing section ${index + 1}/${this.book.sections.length}: ${section.title}`);
                
                const prompt = `
Title: ${section.title}
Content: ${section.content}`;

                // Only run moderation if enabled
                const [summaryResult, moderation] = await Promise.all([
                    this.translator.translate(prompt),
                    this.getModerationResult(section.content)
                ]);
                
                if (!summaryResult.success) {
                    log(`Failed to summarize section ${section.title}: ${summaryResult.message}`);
                    throw new Error(`Failed to summarize section ${index}: ${summaryResult.message}`);
                }

                log(`Successfully processed section: ${section.title}`);
                
                // Only include moderation results if they exist
                const sectionSummary: SectionSummary = {
                    ...summaryResult.data,
                    title: section.title,
                    ...(moderation && { moderation })
                };

                return sectionSummary;
            })
        );

        try {
            const summaries = await Promise.all(summaryPromises);
            this.summary = { sections: summaries };
            return this.summary;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(`Processing failed: ${errorMessage}`);
            throw new Error(`Processing failed: ${errorMessage}`);
        }
    }

    getSummary(): BookSummary | null {
        return this.summary;
    }
}