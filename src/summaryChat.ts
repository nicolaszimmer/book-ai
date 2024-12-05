import { Debugger } from 'debug';
import debug from 'debug';
import Anthropic from '@anthropic-ai/sdk';
import { ComprehensiveSummary } from './summariesAnalyzer';

const log: Debugger = debug('book-ai:chat');

export interface ChatRequest {
    section: keyof ComprehensiveSummary;
    instruction: string;
}

export interface ChatHistoryEntry {
    timestamp: string;
    section: keyof ComprehensiveSummary;
    instruction: string;
    previousContent: string | string[] | null ;
    updatedContent: string | string[];
}

export interface ExportedHistory {
    version: string;
    timestamp: string;
    initialSummary: ComprehensiveSummary;
    history: ChatHistoryEntry[];
    currentSummary: ComprehensiveSummary;
}

export class SummaryChat {
    private anthropic: Anthropic;
    private model: string;
    private summary: ComprehensiveSummary;
    private chatHistory: ChatHistoryEntry[] = [];
    private initialSummary: ComprehensiveSummary;
    private readonly maxHistoryEntries = 5;
    private static readonly HISTORY_VERSION = '1.0';

    constructor(anthropicApiKey: string, model: string, summary: ComprehensiveSummary) {
        this.anthropic = new Anthropic({
            apiKey: anthropicApiKey,
            dangerouslyAllowBrowser: true
        });
        this.model = model;
        this.summary = { ...summary };  // Create deep copy
        this.initialSummary = { ...summary };  // Store initial state
    }

    private getRelevantHistory(section: keyof ComprehensiveSummary): ChatHistoryEntry[] {
        // Get recent entries, prioritizing those for the same section
        const sectionHistory = this.chatHistory
            .filter(entry => entry.section === section)
            .slice(-2); // Get last 2 changes for this section

        const recentHistory = this.chatHistory
            .filter(entry => entry.section !== section)
            .slice(-3); // Get last 3 changes for other sections

        return [...sectionHistory, ...recentHistory]
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    private formatHistoryForPrompt(history: ChatHistoryEntry[]): string {
        if (history.length === 0) return "No previous refinements.";

        return history
            .map(entry => `
Timestamp: ${entry.timestamp}
Section: ${entry.section}
Instruction: ${entry.instruction}
Result: ${JSON.stringify(entry.updatedContent, null, 2)}
            `)
            .join('\n---\n');
    }

    private prepareResponseForParsing(rawResponse: string, section: keyof ComprehensiveSummary): string {
        log('Preparing response for parsing');
        
        try {
            // Try parsing as is first
            JSON.parse(rawResponse);
            return rawResponse;
        } catch (e) {
            log('Response is not valid JSON, attempting to repair');
            
            // Remove any markdown code block syntax
            let cleaned = rawResponse.replace(/```json\n?|\n?```/g, '');
            
            // Try to identify if it's just a plain string/text response
            cleaned = cleaned.trim();
            
            // If it starts with a quote, assume it's meant to be a string
            if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
                return `{"${section}":${cleaned}}`;
            }
            
            // If it's just plain text, wrap it as a string in the proper structure
            if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
                return `{"${section}":"${cleaned.replace(/"/g, '\\"')}"}`;
            }

            // If it's an array but not wrapped in the section key
            if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
                return `{"${section}":${cleaned}}`;
            }

            return cleaned;
        }
    }

    private repairResponse(response: any, section: keyof ComprehensiveSummary): any {
        log('Attempting to repair parsed response if needed');
        
        try {
            // If it's already a string or array, return as is
            if (typeof response === 'string' || Array.isArray(response)) {
                return response;
            }

            // If it's an object containing the section as a key
            if (response[section]) {
                // If the value is nested one level deeper
                if (typeof response[section] === 'object' && response[section][section]) {
                    return response[section][section];
                }
                return response[section];
            }

            // If it's an object but doesn't have the section key
            const keys = Object.keys(response);
            if (keys.length === 1) {
                // If there's only one key and its value is what we want
                return response[keys[0]];
            }

            // If we can't repair it, return the original response
            log('Could not repair response, returning original');
            return response;

        } catch (error) {
            log('Error while trying to repair response:', error);
            return response;
        }
    }

    async refineSection(request: ChatRequest): Promise<ComprehensiveSummary> {
        log(`Refining ${request.section} based on instruction: ${request.instruction}`);

        const currentContent = this.summary[request.section];
        const relevantHistory = this.getRelevantHistory(request.section);
        const historyContext = this.formatHistoryForPrompt(relevantHistory);

        const systemPrompt = `You are an expert book marketing assistant helping to refine book summaries. 
Your task is to modify the content according to the user's instruction while maintaining accuracy:

MODIFICATION GUIDELINES:
1. FACTS: Never contradict established character roles, relationships, or plot points
2. ADDITIONS: You may add new content (like comparable titles or keywords) when specifically requested
3. STYLE: You can freely modify tone, emphasis, and presentation
4. FOCUS: You can highlight or de-emphasize different aspects of the existing content
5. ACCURACY: Any new content must be logically consistent with the source material
6. HISTORY: Consider the history of previous refinements to maintain consistency and build upon prior changes.

Remember: While you can add requested new elements, never invent or modify core story facts or character traits.`;

        try {
            const response = await this.anthropic.messages.create({
                model: this.model,
                max_tokens: 4096,
                temperature: 0.3,
                system: systemPrompt,
                messages: [{
                    role: "user",
                    content: `I have a book summary and want to refine the "${request.section}" section.

Current content of this section:
${JSON.stringify(currentContent, null, 2)}

Previous refinement history:
${historyContext}

Instruction for refinement:
${request.instruction}

Full context of the book:
${JSON.stringify(this.summary, null, 2)}

Please provide an updated version of ONLY the "${request.section}" section that:
1. Maintains consistency with the book's overall tone and content
2. Implements the requested changes
3. Builds upon and maintains consistency with previous refinements
4. Keeps the same format as the original

IMPORTANT:
1. Make only changes that align with the user's specific request
2. Maintain consistency with the source material
3. NEVER invent new plot elements or character details
4. If adding new content (like comparable titles), ensure it fits logically with the established material

Return ONLY the new content for this section, formatted as valid JSON that can replace the existing content, like
{"${request.section}":"New content here"}. Never include notes, remarks or anything other then the refined section.`
                }]
            });

            if (response.content[0].type !== 'text') {
                throw new Error('Unexpected response type from Anthropic API');
            }

            // Prepare the response for parsing
            const preparedResponse = this.prepareResponseForParsing(response.content[0].text, request.section);
            
            // Parse the prepared response
            let updatedContent: any;
            try {
                updatedContent = JSON.parse(preparedResponse);
            } catch (error) {
                log('Failed to parse prepared response:', error);
                throw new Error(`Failed to parse response: ${error}`);
            }
            
            // Repair the parsed response structure if needed
            updatedContent = this.repairResponse(updatedContent, request.section);
            
            // Create new summary object with updated content
            const updatedSummary = {
                ...this.summary,
                [request.section]: updatedContent
            };

            // Store the change in history
            this.chatHistory.push({
                timestamp: new Date().toISOString(),
                section: request.section,
                instruction: request.instruction,
                previousContent: currentContent,
                updatedContent: updatedContent
            });

            // Update stored summary
            this.summary = updatedSummary;
            
            return updatedSummary;

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(`Refinement failed: ${errorMessage}`);
            throw new Error(`Failed to refine summary: ${errorMessage}`);
        }
    }

    /**
     * Export the complete history including initial and current state
     */
    exportHistory(): ExportedHistory {
        return {
            version: SummaryChat.HISTORY_VERSION,
            timestamp: new Date().toISOString(),
            initialSummary: this.initialSummary,
            history: this.chatHistory,
            currentSummary: this.summary
        };
    }

    /**
     * Import a previously exported history
     * @throws Error if the history format is invalid or incompatible
     */
    importHistory(exported: ExportedHistory): void {
        if (!exported.version || exported.version !== SummaryChat.HISTORY_VERSION) {
            throw new Error('Incompatible history version');
        }

        if (!exported.initialSummary || !exported.history || !exported.currentSummary) {
            throw new Error('Invalid history format');
        }

        this.initialSummary = exported.initialSummary;
        this.chatHistory = exported.history;
        this.summary = exported.currentSummary;

        log(`Imported history with ${this.chatHistory.length} entries`);
    }

    /**
     * Revert changes to a specific point in history
     * @param timestamp - Revert to the state after this timestamp's change
     * @returns The reverted summary
     * @throws Error if timestamp is not found
     */
    revertToTimestamp(timestamp: string): ComprehensiveSummary {
        const entryIndex = this.chatHistory.findIndex(entry => entry.timestamp === timestamp);
        if (entryIndex === -1) {
            throw new Error('Timestamp not found in history');
        }

        // Keep history up to and including the target entry
        this.chatHistory = this.chatHistory.slice(0, entryIndex + 1);

        // Rebuild state from initial summary and applying changes up to the target point
        let rebuiltSummary = { ...this.initialSummary };
        for (const entry of this.chatHistory) {
            rebuiltSummary = {
                ...rebuiltSummary,
                [entry.section]: entry.updatedContent
            };
        }

        this.summary = rebuiltSummary;
        return this.summary;
    }

    /**
     * Revert the last change
     * @returns The reverted summary
     * @throws Error if there's no history to revert
     */
    revertLastChange(): ComprehensiveSummary {
        if (this.chatHistory.length === 0) {
            throw new Error('No changes to revert');
        }

        const lastEntry = this.chatHistory[this.chatHistory.length - 1];
        
        // Update the summary with the previous content
        this.summary = {
            ...this.summary,
            [lastEntry.section]: lastEntry.previousContent
        };

        // Remove the last entry from history
        this.chatHistory.pop();

        return this.summary;
    }

    /**
     * Reset to initial state
     * @returns The initial summary
     */
    reset(): ComprehensiveSummary {
        this.summary = { ...this.initialSummary };
        this.chatHistory = [];
        return this.summary;
    }


    getSummary(): ComprehensiveSummary {
        return this.summary;
    }

    getHistory(): ChatHistoryEntry[] {
        return this.chatHistory;
    }
}