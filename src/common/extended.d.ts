import { MenuItem } from '../controls/PopupMenu';

declare global {
  interface MouseEvent {
    menuItems?: MenuItem[];
  }
}

export {};