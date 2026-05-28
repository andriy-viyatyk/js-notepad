// Types (re-export selectively to avoid collision with v4 EditorModule /
// EditorDefinition re-exported via ./base — consumers wanting the v4 shapes
// import from ./base/editorRegistry directly; the legacy shapes here live
// only in ./types and are scheduled for removal post-EPIC-028 close).
export type {
    FileEditorComponent,
    EditorModelCreations,
    EditorViewModule,
    EditorCategory,
} from './types';

// Base classes and components
export * from './base';

// Text Editor
export * from './text';

// Grid Editor
export * from './grid';

// Markdown Editor
export * from './markdown';

// PDF Editor
export * from './pdf';

// Compare Editor
export * from './compare';
