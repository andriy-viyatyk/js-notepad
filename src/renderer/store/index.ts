// Files and data management
export { filesModel } from './files-store';

// Pages management
export { PagesModel, pagesModel } from './pages-store';
export { newPageModel, newEmptyPageModel, newPageModelFromState } from './page-factory';

// Settings
export { appSettings } from './app-settings';
export type { AppSettingsKey } from './app-settings';

// Recent files
export { recentFiles } from './recent-files';

// Menu folders
export { menuFolders } from './menu-folders';
export type { MenuFolder } from './menu-folders';

// Language utilities
export { getLanguageById, getLanguageByExtension } from './language-mapping';
