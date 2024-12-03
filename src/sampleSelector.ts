import OpenAI from 'openai';
import { Debugger } from 'debug';
import debug from 'debug';

const log: Debugger = debug('book-ai:sampler');

export type ContentType = 'frontmatter' | 'bodymatter' | 'backmatter';

export interface ContentElement {
    id: string;
    label: string;
    href: string;
    index: number;
    type?: ContentType;
    role?: string;
    children?: ContentElement[];
}

export class SampleSelector {
    private openai: OpenAI;

    constructor(apiKey: string) {
        this.openai = new OpenAI({
            apiKey: apiKey
        });
    }

    async selectContent(contents: ContentElement[]): Promise<string[]> {
        log('Selecting content for sampler');

        const prompt = `As an expert in book marketing and publishing, analyze this book's content structure and select sections that would make an effective sample (roughly 5-10% of the content, but not more than six items) for potential readers and ARC reviewers.

Content Structure:
${JSON.stringify(contents, null, 2)}

Guidelines for selection:
1. Include relevant front matter that provides context
2. Include engaging opening content that hooks readers
3. Ensure selections flow logically and maintain coherence

Analyze the content structure and return ONLY a JSON array of selected section IDs, like this:
{"selectedIds": ["section-1", "section-4", "section-7"]}

Important: Return ONLY the JSON array, no additional text or explanations.`;

        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a publishing expert selecting content for book samplers. Return only JSON arrays of selected IDs.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 500
            });

            const result = response.choices[0]?.message?.content;
            if (!result) {
                throw new Error('No selection received from OpenAI');
            }

            // Parse and validate the response
            try {
                const parsed = JSON.parse(result);
                if (!Array.isArray(parsed.selectedIds)) {
                    throw new Error('Invalid response format');
                }

                // Validate that all IDs exist in the original content
                const validIds = new Set(contents.flatMap(el => this.getAllIds(el)));
                const selectedIds = parsed.selectedIds.filter((id: string) => validIds.has(id));

                log(`Selected ${selectedIds.length} sections for sampler`);
                return selectedIds;
            } catch (error) {
                throw new Error(`Failed to parse selection: ${error}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(`Selection failed: ${errorMessage}`);
            throw new Error(`Failed to select sampler content: ${errorMessage}`);
        }
    }

    private getAllIds(element: ContentElement): string[] {
        const ids = [element.id];
        if (element.children) {
            element.children.forEach(child => {
                ids.push(...this.getAllIds(child));
            });
        }
        return ids;
    }
}