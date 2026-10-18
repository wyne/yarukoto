#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// SMAppServiceStatus, plus Unavailable for a build that can't reach it.
typedef NS_ENUM(NSInteger, YKLoginItemStatus) {
  YKLoginItemStatusUnavailable = -1,
  YKLoginItemStatusNotRegistered = 0,
  YKLoginItemStatusEnabled = 1,
  YKLoginItemStatusRequiresApproval = 2,
  YKLoginItemStatusNotFound = 3,
};

/**
 * The Mac behaviours a menu bar app needs and Mac Catalyst doesn't offer: an
 * icon in the menu bar, opening at login, and staying alive with the window
 * closed. See YKMacAppKit.m for how each one is reached.
 *
 * Main thread only. Everything is a no-op off the Mac.
 */
@interface YKMacAppKit : NSObject

/// True on the Mac, once AppKit's classes are in the process.
@property (class, readonly) BOOL available;

/**
 * Whether Yarukoto lives in the menu bar. While it does, closing the window
 * hides it instead, and the Dock icon goes with it; Open in the menu brings
 * both back. Stored in UserDefaults, because launch reads it before JS runs.
 */
@property (class) BOOL menuBarEnabled;

/// Whether this launch came from the login item.
@property (class, readonly) BOOL launchedAtLogin;

/**
 * Receives a menu choice JS answers: "complete" with a task id, or "newTask",
 * "settings" or "today". Open and Quit are answered here.
 */
@property (class, copy, nullable) void (^onAction)(NSString *action, NSString *_Nullable taskId);

/// Called by the app delegate subscriber, once, as launch finishes.
+ (void)applicationDidFinishLaunching;

/**
 * Today's tasks for the menu, as `{ id, title, overdue }`, the number left out
 * of the list, and the count the icon shows (0 shows none).
 */
+ (void)setTasks:(NSArray<NSDictionary<NSString *, id> *> *)tasks more:(NSInteger)more count:(NSInteger)count;

/// Brings the window, and the Dock icon, back and makes Yarukoto active.
+ (void)showMainWindow;

+ (YKLoginItemStatus)loginItemStatus;
+ (BOOL)setOpensAtLogin:(BOOL)enabled error:(NSError **)error;
/// System Settings ▸ General ▸ Login Items, where a registration awaiting approval is approved.
+ (void)openLoginItemsSettings;

@end

NS_ASSUME_NONNULL_END
