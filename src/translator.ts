import { Result, TypeChatLanguageModel, createJsonTranslator, TypeChatJsonTranslator } from "typechat";
import { createTypeScriptJsonValidator } from "typechat/ts";
import { SectionSummary } from "./schema/summarySchema";

type ChatMessage = {
    source: "system" | "user" | "assistant";
    body: object;
};

export interface BookTranslatorWithHistory {
    _chatHistory: ChatMessage[];
    _maxPromptLength: number;
    _additionalAgentInstructions: string;
    _translator: TypeChatJsonTranslator<SectionSummary>;
    translate(request: string): Promise<Result<SectionSummary>>;
}

export function createBookTranslator(
    model: TypeChatLanguageModel, 
    schema: string, 
    additionalAgentInstructions: string = ""
): BookTranslatorWithHistory {
    const _chatHistory: ChatMessage[] = [];
    const _maxPromptLength = 4096;
    const _additionalAgentInstructions = additionalAgentInstructions;
    
    const validator = createTypeScriptJsonValidator<SectionSummary>(schema, "SectionSummary");
    const _translator = createJsonTranslator(model, validator);
    _translator.createRequestPrompt = createRequestPrompt;
    
    const customTranslator: BookTranslatorWithHistory = {
        _chatHistory,
        _maxPromptLength,
        _additionalAgentInstructions,
        _translator,
        translate,
    };

    return customTranslator;

    async function translate(request: string): Promise<Result<SectionSummary>> {
        const response = await _translator.translate(request);
        if (response.success) {
            _chatHistory.push({ source: "assistant", body: response.data });
        }
        return response;
    }

    function createRequestPrompt(intent: string): string {
        const recentHistory = _chatHistory.slice(-5);
        const historyStr = JSON.stringify(recentHistory, undefined, 2);
        
        const prompt = `
You are a service that translates user requests into JSON objects of type "SectionSummary" according to the following TypeScript definitions:
'''
${schema}
'''

You are a literary analyst focusing on creating detailed summaries of book sections.
${_additionalAgentInstructions}

Previous analysis context (if any):
${historyStr}

Guidelines:
- summary: Provide a clear, comprehensive overview of the section's content
- writingStyle: Use 2-4 key descriptive words (e.g., "descriptive, dialogue-heavy, fast-paced")
- tonality: Use 2-4 emotional/mood keywords (e.g., "tense, reflective, humorous")
- keyEvents: List main plot points and significant developments

The following is a section to analyze:
'''
${intent}
'''

The following is the analysis translated into a JSON object with 2 spaces of indentation and no properties with the value undefined:
`;
        return prompt;
    }
}
