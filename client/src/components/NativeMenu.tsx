import React from 'react';
import CommunityMenuView, {
  type MenuAction,
  type MenuComponentProps,
  type NativeActionEvent,
} from '@expo/ui/community/menu';
import { Button, Host, Menu, RNHostView, Section, Toggle } from '@expo/ui/swift-ui';
import { buttonStyle, disabled, menuIndicator, menuStyle, tint } from '@expo/ui/swift-ui/modifiers';
import { MAC } from '../data/platform';

export type { MenuAction, NativeActionEvent };

/**
 * `@expo/ui`'s MenuView, with a trigger the Mac can draw.
 *
 * MenuView wraps a SwiftUI `Menu` around our own label. On a phone SwiftUI draws
 * that label as given. On the Mac its default menu style is a system pop-up
 * button, which draws a bezel and a chevron of its own and cannot show a custom
 * label — so every value-and-chevron trigger came out as an empty pill. Styled
 * as a plain button with its indicator hidden, the Mac draws our label instead,
 * and the menu it opens is still the system's.
 *
 * MenuView takes no modifiers, so on the Mac this builds the same menu from the
 * same SwiftUI pieces; everywhere else it is MenuView itself.
 */
export default function NativeMenu(props: MenuComponentProps) {
  if (!MAC) return <CommunityMenuView {...props} />;
  return <MacMenu {...props} />;
}

const MAC_TRIGGER = [menuStyle('button'), buttonStyle('plain'), menuIndicator('hidden')];

function MacMenu({ actions, onPressAction, title, style, children, testID }: MenuComponentProps) {
  const items = actions.map((action) => renderAction(action, onPressAction));
  return (
    <Host matchContents style={style} testID={testID} ignoreSafeArea="all">
      <Menu
        modifiers={MAC_TRIGGER}
        label={
          <RNHostView matchContents>
            <>{children}</>
          </RNHostView>
        }
      >
        {title ? <Section title={title}>{items}</Section> : items}
      </Menu>
    </Host>
  );
}

/** The same mapping MenuView makes from an action to a SwiftUI item. */
function renderAction(action: MenuAction, onPressAction: MenuComponentProps['onPressAction']): React.ReactNode {
  if (action.attributes?.hidden) return null;

  const { subactions, displayInline, state, attributes, image, imageColor, title } = action;
  const key = action.id ?? title;
  const systemImage = typeof image === 'string' ? image : undefined;

  if (subactions && subactions.length > 0) {
    const children = subactions.map((sub) => renderAction(sub, onPressAction));
    return displayInline ? (
      <Section key={key} title={title}>
        {children}
      </Section>
    ) : (
      <Menu key={key} label={title} systemImage={systemImage}>
        {children}
      </Menu>
    );
  }

  const fire = () => onPressAction?.({ nativeEvent: { event: key } });
  const modifiers = [
    ...(attributes?.disabled ? [disabled(true)] : []),
    ...(imageColor && !attributes?.destructive ? [tint(imageColor)] : []),
  ];

  if (state === 'on' || state === 'off') {
    return (
      <Toggle
        key={key}
        label={title}
        systemImage={systemImage}
        isOn={state === 'on'}
        onIsOnChange={fire}
        modifiers={modifiers.length > 0 ? modifiers : undefined}
      />
    );
  }

  return (
    <Button
      key={key}
      label={title}
      systemImage={systemImage}
      role={attributes?.destructive ? 'destructive' : undefined}
      modifiers={modifiers.length > 0 ? modifiers : undefined}
      onPress={fire}
    />
  );
}
