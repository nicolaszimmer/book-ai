// src/loader.ts
import { Book, BookSection } from './types';

export class BookLoader {
  private static splitIntoSections(markdown: string): BookSection[] {
    const sections: BookSection[] = [];
    const lines = markdown.split('\n');
    let currentSection: BookSection | null = null;
    let content: string[] = [];

    for (let line of lines) {
      if (line.startsWith('# ')) {
        if (currentSection) {
          currentSection.content = content.join('\n').trim();
          sections.push(currentSection);
          content = [];
        }
        currentSection = {
          title: line.substring(2).trim(),
          content: ''
        };
      } else if (currentSection) {
        content.push(line);
      }
    }

    if (currentSection && content.length > 0) {
      currentSection.content = content.join('\n').trim();
      sections.push(currentSection);
    }

    return sections;
  }

  static load(content: string | [string, string][] | Map<string, string>): Book {
    if (typeof content === 'string') {
      return {
        sections: this.splitIntoSections(content)
      };
    }

    const sections: BookSection[] = [];
    const entries = Array.from(content instanceof Map ? content.entries() : content);
    
    for (const [key, value] of entries) {
      sections.push({
        title: key,
        content: value
      });
    }

    return { sections };
  }
}