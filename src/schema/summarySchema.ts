// Define specific types for moderation categories and scores
export interface ModerationCategories {
  sexual: boolean;
  'sexual/minors': boolean;
  harassment: boolean;
  'harassment/threatening': boolean;
  hate: boolean;
  'hate/threatening': boolean;
  illicit: boolean;
  'illicit/violent': boolean;
  'self-harm': boolean;
  'self-harm/intent': boolean;
  'self-harm/instructions': boolean;
  violence: boolean;
  'violence/graphic': boolean;
}

interface ModerationCategoryScores {
  sexual: number;
  'sexual/minors': number;
  harassment: number;
  'harassment/threatening': number;
  hate: number;
  'hate/threatening': number;
  illicit: number;
  'illicit/violent': number;
  'self-harm': number;
  'self-harm/intent': number;
  'self-harm/instructions': number;
  violence: number;
  'violence/graphic': number;
}

// Update ModerationResult to use specific types
export interface ModerationResult {
  flagged: boolean;
  categories: ModerationCategories;
  categoryScores: ModerationCategoryScores;
}

// Update the SectionSummary interface to include moderation
export interface SectionSummary {
  title: string;           
  summary: string;         
  writingStyle: string;    
  tonality: string;        
  keyEvents: string[];
  qualityIssues: string[];
  moderation: ModerationResult | null;
}

export interface BookSummary {
  sections: SectionSummary[];  
}