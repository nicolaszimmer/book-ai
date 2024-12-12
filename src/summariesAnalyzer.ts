import { Debugger } from 'debug';
import debug from 'debug';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { BookSummary, ModerationCategories } from './schema/summarySchema';

const log: Debugger = debug('book-ai:analyzer');

interface ComprehensiveSummary {
    summary: string;
    writingStyle: string;
    quality: string | null;
    keywords: string[];
    genres: string[];
    marketingCopy: string;
    comparableAuthors: string[];
    flagged: boolean;
    moderationCategories: ModerationCategories;
}

type ApiProvider = 'anthropic' | 'openai';

interface AnalyzerConfig {
    provider: ApiProvider;
    model: string;
    anthropicApiKey?: string;
    openaiApiKey?: string;
    temperature?: number; // Optional with default value
}

export class SummariesAnalyzer {
    private anthropic?: Anthropic;
    private openai?: OpenAI;
    private config: Required<Pick<AnalyzerConfig, 'provider' | 'model' | 'temperature'>>;
    private static readonly DEFAULT_TEMPERATURE = 0;
  
    
    constructor(config: AnalyzerConfig) {
        this.config = {
            provider: config.provider,
            model: config.model,
            temperature: config.temperature ?? SummariesAnalyzer.DEFAULT_TEMPERATURE
        };
        
        if (config.provider === 'anthropic') {
            if (!config.anthropicApiKey) throw new Error('Anthropic API key is required when using Anthropic');
            this.anthropic = new Anthropic({
                apiKey: config.anthropicApiKey
            });
        } else if (config.provider === 'openai') {
            if (!config.openaiApiKey) throw new Error('OpenAI API key is required when using OpenAI');
            this.openai = new OpenAI({
                apiKey: config.openaiApiKey
            });
        }
    }

    private computeAggregatedModeration(summaries: BookSummary): { flagged: boolean; moderationCategories: ModerationCategories } {
        // Initialize with all false values
        const aggregatedCategories: ModerationCategories = {
            sexual: false,
            'sexual/minors': false,
            harassment: false,
            'harassment/threatening': false,
            hate: false,
            'hate/threatening': false,
            illicit: false,
            'illicit/violent': false,
            'self-harm': false,
            'self-harm/intent': false,
            'self-harm/instructions': false,
            violence: false,
            'violence/graphic': false
        };

        let isFlagged = false;

        // Aggregate moderation results
        for (const section of summaries.sections) {
            if (section.moderation) {
                isFlagged = isFlagged || section.moderation.flagged;
            
                for (const [category, value] of Object.entries(section.moderation.categories)) {
                    aggregatedCategories[category as keyof ModerationCategories] =
                        aggregatedCategories[category as keyof ModerationCategories] || value;
                }
            }
        }

        return {
            flagged: isFlagged,
            moderationCategories: aggregatedCategories
        };
    }

    private async analyzeWithAnthropic(summariesText: string): Promise<Omit<ComprehensiveSummary, 'flagged' | 'moderationCategories'>> {
        if (!this.anthropic) throw new Error('Anthropic client not initialized');

        const response = await this.anthropic.messages.create({
            model: this.config.model,
            max_tokens: 4096,
            temperature: this.config.temperature,
            system: "You are a literary analyst creating comprehensive book summaries. Analyze the provided section summaries and create a cohesive analysis. Return only a JSON object with the specified structure, without any additional text or explanations.",
            messages: [{
                role: "user",
                content: this.createPrompt(summariesText)
            }]
        });

        if (response.content[0].type !== 'text') {
            throw new Error('Unexpected response type from Anthropic API');
        }

        return JSON.parse(response.content[0].text);
    }

    private async analyzeWithOpenAI(summariesText: string): Promise<Omit<ComprehensiveSummary, 'flagged' | 'moderationCategories'>> {
        if (!this.openai) throw new Error('OpenAI client not initialized');

        const response = await this.openai.chat.completions.create({
            model: this.config.model,
            temperature: this.config.temperature,
            max_tokens: 4096,
            messages: [
                {
                    role: "system",
                    content: "You are a literary analyst creating comprehensive book summaries. Analyze the provided section summaries and create a cohesive analysis. Return only a JSON object with the specified structure, without any additional text or explanations."
                },
                {
                    role: "user",
                    content: this.createPrompt(summariesText)
                }
            ]
        });

        return JSON.parse(response.choices[0].message.content || '{}');
    }

    private createPrompt(summariesText: string): string {
        return `Analyze these book section summaries and create:
1. A cohesive, extensive summary that connects all sections (at least 500 words)
2. An analysis of the overall writing style
3. An analysis of quality problems. Also look at the overall plot, narrative and chapter structure. If no issues are found, return null.
4. Key thematic keywords (10-15 words or short phrases)
5. Up to three genre categories that best fit the work
6. Marketing copy for the book, suitable for Amazon. Don't give away important developments and adhere to the conventions of the genre.
7. Up to three comparable authors (first and last name) that write in the same style, gnere and topics 

Here are the section summaries:
${summariesText}

Return the analysis as a JSON object with this structure:
{
    "summary": "comprehensive summary here",
    "writingStyle": "writing style analysis here", 
    "quality": "quality analysis here" | null,
    "keywords": ["keyword1", "keyword2", ...],
    "genres": ["genre1", "genre2", "genre3"],
    "marketingCopy": "compose marketing copy here",
    "comparableAuthors": ["author1 first last name", "author2 first last name","author3 first last name"]
}`;
    }

    async analyze(summaries: BookSummary): Promise<ComprehensiveSummary> {
        log(`Analyzing summaries with ${this.config.provider}`);

        const summariesText = summaries.sections
            .map(section => `
Section: ${section.title}
Summary: ${section.summary}
Writing Style: ${section.writingStyle}
Tone: ${section.tonality}
Key Events: ${section.keyEvents.join(', ')}
Quality Issues: ${section.qualityIssues.join(', ')}
            `)
            .join('\n');

        try {
            // Get analysis based on provider
            const llmResult = this.config.provider === 'anthropic' 
                ? await this.analyzeWithAnthropic(summariesText)
                : await this.analyzeWithOpenAI(summariesText);
            
            // Compute aggregated moderation data
            const moderationData = this.computeAggregatedModeration(summaries);

            // Combine LLM results with computed moderation data
            const result: ComprehensiveSummary = {
                ...llmResult,
                ...moderationData
            };

            log('Analysis completed.');
            return result;

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(`Analysis failed: ${errorMessage}`);
            throw new Error(`Failed to analyze summaries: ${errorMessage}`);
        }
    }
}

export type { ComprehensiveSummary, ModerationCategories, AnalyzerConfig, ApiProvider };