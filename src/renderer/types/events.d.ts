import { ContextMenuEvent } from '../core/events/context-menu';

declare global {
  interface MouseEvent {
    contextMenuEvent?: ContextMenuEvent<unknown>;
    contextMenuPromise?: Promise<boolean>;
  }
}

export {};
