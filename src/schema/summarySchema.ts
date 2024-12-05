export interface SectionSummary {
  title: string;           
  summary: string;         
  writingStyle: string;    
  tonality: string;        
  keyEvents: string[];
  qualityIssues: string[];
}

export interface BookSummary {
  sections: SectionSummary[];  
}
