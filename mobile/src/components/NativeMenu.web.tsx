import React from 'react';
import CommunityMenuView, {
  type MenuAction,
  type MenuComponentProps,
  type NativeActionEvent,
} from '@expo/ui/community/menu';

export type { MenuAction, NativeActionEvent };

/**
 * The web build of NativeMenu, without the Mac's SwiftUI trigger.
 *
 * `@expo/ui/swift-ui` looks up its native module the moment it is imported, and
 * the web has none, so importing it at all stops the web app before it draws
 * anything. The web has no Mac branch to reach, so it never needs it.
 */
export default function NativeMenu(props: MenuComponentProps) {
  return <CommunityMenuView {...props} />;
}
