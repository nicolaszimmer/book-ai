// Define the moderation result interface
interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
}

// Update the SectionSummary interface to include moderation
export interface SectionSummary {
  title: string;           
  summary: string;         
  writingStyle: string;    
  tonality: string;        
  keyEvents: string[];
  qualityIssues: string[];
  moderation?: ModerationResult;
}

export interface BookSummary {
  sections: SectionSummary[];  
}