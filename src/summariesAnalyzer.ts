import { Debugger } from 'debug';
import debug from 'debug';
import Anthropic from '@anthropic-ai/sdk';
import { BookSummary } from './schema/summarySchema';

const log: Debugger = debug('book-ai:analyzer');

interface ComprehensiveSummary {
    summary: string;
    writingStyle: string;
    keywords: string[];
    genres: string[];
    marketingCopy: string;
    comparableAuthors: string[];
}

export class SummariesAnalyzer {
    private anthropic: Anthropic;
    private model: string;
    
    constructor(anthropicApiKey: string, model: string) {
        this.anthropic = new Anthropic({
            apiKey: anthropicApiKey
        });
        this.model = model;
    }

    async analyze(summaries: BookSummary): Promise<ComprehensiveSummary> {
        log('Analyzing summaries with Claude');

        const summariesText = summaries.sections
            .map(section => `
Section: ${section.title}
Summary: ${section.summary}
Writing Style: ${section.writingStyle}
Tone: ${section.tonality}
Key Events: ${section.keyEvents.join(', ')}
            `)
            .join('\n');

        try {
            const response = await this.anthropic.messages.create({
                model: this.model,
                max_tokens: 4096,
                temperature: 0,
                system: "You are a literary analyst creating comprehensive book summaries. Analyze the provided section summaries and create a cohesive analysis. Return only a JSON object with the specified structure, without any additional text or explanations.",
                messages: [{
                    role: "user",
                    content: `Analyze these book section summaries and create:
1. A cohesive, extensive summary that connects all sections (at least 500 words)
2. An analysis of the overall writing style
3. Key thematic keywords (10-15 words or short phrases)
4. Up to three genre categories that best fit the work
5. Marketing copy for the book, suitable for Amazon. Don't give away important developments and adhere to the conventions of the genre.
6. Up to three comparable authors (first and last name) that write in the same style, gnere and topics 

Here are the section summaries:
${summariesText}

Return the analysis as a JSON object with this structure:
{
    "summary": "comprehensive summary here",
    "writingStyle": "writing style analysis here",
    "keywords": ["keyword1", "keyword2", ...],
    "genres": ["genre1", "genre2", "genre3"],
    "marketingCopy": "compose marketing copy here",
    "comparableAuthors": ["author1 first last name", "author2 first last name","author3 first last name"]
}`
                }]
            });

            if (response.content[0].type !== 'text') {
                throw new Error('Unexpected response type from Anthropic API');
            }

            const result = JSON.parse(response.content[0].text) as ComprehensiveSummary;
            return result;

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(`Analysis failed: ${errorMessage}`);
            throw new Error(`Failed to analyze summaries: ${errorMessage}`);
        }
    }
}

export type { ComprehensiveSummary };