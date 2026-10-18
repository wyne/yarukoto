#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Whether ⌘ is being held on its own, for the shortcut hints drawn while it is
 * (src/navigation/shortcutHints.ts).
 *
 * UIKit has no way to hear a modifier pressed by itself from wherever focus
 * happens to be, so this watches the app's events through AppKit's NSEvent
 * instead, reached by name as YKMacAppKit.m (mac-status-item) reaches the rest
 * of AppKit.
 *
 * Main thread only. Does nothing off the Mac.
 */
@interface YKCommandKey : NSObject

/**
 * Starts watching, replacing any earlier handler, or stops with nil.
 *
 * `held` turns YES as ⌘ goes down alone, and NO as it comes up, as another
 * modifier joins it, or as it is used: a key pressed or a click made while it is
 * down, which means a shortcut rather than a look at the hints.
 */
+ (void)watch:(nullable void (^)(BOOL held))onChange;

@end

NS_ASSUME_NONNULL_END
