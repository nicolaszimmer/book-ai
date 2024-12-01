export interface BookSection {
  title: string;
  content: string;
}

export interface Book {
  sections: BookSection[];
}
