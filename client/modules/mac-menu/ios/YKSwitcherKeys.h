#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * ⌃Tab, ⌃⇧Tab and ⌃` for the task switcher (src/components/TaskSwitcher.tsx),
 * and ⌃ coming up, which is what opens the task it is on.
 *
 * Not menu items: a menu's key equivalent is heard going down and never coming
 * up, and the switcher is only finished when ⌃ is let go. So these are taken
 * from the app's events through AppKit's NSEvent, as YKCommandKey watches ⌘,
 * before anything focused hears them.
 *
 * Main thread only. Does nothing off the Mac.
 */
@interface YKSwitcherKeys : NSObject

/**
 * Starts watching, replacing any earlier handlers, or stops with nil.
 *
 * `onStep` gets 1 for ⌃Tab and -1 for ⌃⇧Tab or ⌃`, each of which is taken from
 * whatever has focus. `onRelease` follows when ⌃ comes up after any of them.
 */
+ (void)watchSteps:(nullable void (^)(NSInteger step))onStep released:(nullable void (^)(void))onRelease;

@end

NS_ASSUME_NONNULL_END
