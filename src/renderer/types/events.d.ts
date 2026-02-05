import { MenuItem } from '../components/overlay/PopupMenu';

declare global {
  interface MouseEvent {
    menuItems?: MenuItem[];
  }
}

export {};