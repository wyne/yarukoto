#import "YKMacAppKit.h"

#import <TargetConditionals.h>
#import <UIKit/UIKit.h>
#import <dlfcn.h>
#import <objc/message.h>
#import <objc/runtime.h>

/*
 * Mac Catalyst compiles against UIKit, and the menu bar extra, the login item
 * and the Dock icon are all AppKit's — NSStatusItem, SMAppService,
 * NSApplication's activation policy. Catalyst code can't import AppKit, but
 * AppKit is loaded in every Catalyst process (it is what draws the windows), so
 * its classes are there to be found by name.
 *
 * The protocols below declare the handful of methods used, with AppKit's real
 * signatures, so each call is an ordinary typed message send rather than a
 * `performSelector` that can't pass a BOOL or a CGFloat. They describe AppKit;
 * nothing here adopts them. Constants are copied from the AppKit headers for the
 * same reason, and are part of AppKit's ABI, so they don't move.
 *
 * The other way to reach AppKit from Catalyst is a macOS bundle target shipped
 * inside the app and loaded at launch. That gives the compiler AppKit's headers,
 * at the cost of a second target, its signing and its embedding, all written into
 * the generated Xcode project by plugins/mac-catalyst. For this much API —
 * MacPointer already sets NSCursor this way — the runtime route is less to keep
 * working. Should the bridge grow much past this, the bundle is the way to go.
 */

static NSString *const YKMenuBarEnabledKey = @"YarukotoMenuBarExtra";

@interface YKMacAppKit ()
/// Orders the window out and drops the Dock icon; the menu bar extra is what's left.
+ (void)hideMainWindow;
@end

#if TARGET_OS_MACCATALYST

#pragma mark - AppKit, as far as this file needs it

static const NSInteger YKActivationPolicyRegular = 0;   // NSApplicationActivationPolicyRegular
static const NSInteger YKActivationPolicyAccessory = 1; // NSApplicationActivationPolicyAccessory
static const CGFloat YKVariableStatusItemLength = -1;   // NSVariableStatusItemLength
static const NSUInteger YKImageLeft = 2;                // NSImageLeft

// Apple event codes (AE/AERegistry.h).
static const uint32_t YKCoreEventClass = 'aevt';
static const uint32_t YKOpenApplication = 'oapp';
static const uint32_t YKReopenApplication = 'rapp';
static const uint32_t YKPropData = 'prdt';
static const uint32_t YKLaunchedAsLogInItem = 'lgit';

@protocol YKApplication <NSObject>
- (nullable id)delegate;
- (NSArray *)windows;
- (BOOL)setActivationPolicy:(NSInteger)policy;
- (void)activate;
- (void)activateIgnoringOtherApps:(BOOL)flag;
- (void)terminate:(nullable id)sender;
@end

@protocol YKApplicationClass <NSObject>
- (id<YKApplication>)sharedApplication;
@end

@protocol YKWindow <NSObject>
- (void)orderOut:(nullable id)sender;
- (void)makeKeyAndOrderFront:(nullable id)sender;
- (BOOL)isMiniaturized;
- (void)deminiaturize:(nullable id)sender;
@end

@protocol YKStatusBarClass <NSObject>
- (id)systemStatusBar;
@end

@protocol YKStatusBar <NSObject>
- (id)statusItemWithLength:(CGFloat)length;
- (void)removeStatusItem:(id)item;
@end

@protocol YKStatusItem <NSObject>
- (id)button;
- (void)setMenu:(nullable id)menu;
@end

@protocol YKStatusBarButton <NSObject>
- (void)setImage:(nullable id)image;
- (void)setTitle:(NSString *)title;
- (void)setImagePosition:(NSUInteger)position;
- (void)setToolTip:(nullable NSString *)toolTip;
@end

@protocol YKImageClass <NSObject>
- (nullable id)imageWithSystemSymbolName:(NSString *)name accessibilityDescription:(nullable NSString *)description;
@end

@protocol YKImage <NSObject>
- (nullable instancetype)initWithData:(NSData *)data;
- (void)setSize:(CGSize)size;
- (void)setTemplate:(BOOL)isTemplate;
- (void)setAccessibilityDescription:(nullable NSString *)description;
@end

@protocol YKMenu <NSObject>
- (instancetype)initWithTitle:(NSString *)title;
- (void)addItem:(id)item;
- (void)setAutoenablesItems:(BOOL)flag;
@end

@protocol YKMenuItemClass <NSObject>
- (id)separatorItem;
- (id)sectionHeaderWithTitle:(NSString *)title;
@end

@protocol YKMenuItem <NSObject>
- (instancetype)initWithTitle:(NSString *)title action:(nullable SEL)action keyEquivalent:(NSString *)key;
- (void)setTarget:(nullable id)target;
- (void)setEnabled:(BOOL)enabled;
- (void)setImage:(nullable id)image;
- (void)setToolTip:(nullable NSString *)toolTip;
- (void)setRepresentedObject:(nullable id)object;
- (nullable id)representedObject;
@end

@protocol YKAppleEventManagerClass <NSObject>
- (id)sharedAppleEventManager;
@end

@protocol YKAppleEventManager <NSObject>
- (nullable id)currentAppleEvent;
- (void)setEventHandler:(id)handler andSelector:(SEL)selector forEventClass:(uint32_t)eventClass andEventID:(uint32_t)eventID;
@end

@protocol YKAppleEventDescriptor <NSObject>
- (uint32_t)eventID;
- (nullable id)paramDescriptorForKeyword:(uint32_t)keyword;
- (uint32_t)enumCodeValue;
@end

@protocol YKAppServiceClass <NSObject>
- (id)mainAppService;
- (void)openSystemSettingsLoginItems;
@end

@protocol YKAppService <NSObject>
- (NSInteger)status;
- (BOOL)registerAndReturnError:(NSError **)error;
- (BOOL)unregisterAndReturnError:(NSError **)error;
@end

static id<YKApplication> App(void)
{
  return [(id<YKApplicationClass>)NSClassFromString(@"NSApplication") sharedApplication];
}

static id<YKAppleEventManager> AppleEvents(void)
{
  return [(id<YKAppleEventManagerClass>)NSClassFromString(@"NSAppleEventManager") sharedAppleEventManager];
}

/// A template SF Symbol, so the menu bar tints it for light, dark and highlighted.
static id _Nullable Symbol(NSString *name, NSString *_Nullable description)
{
  id image = [(id<YKImageClass>)NSClassFromString(@"NSImage") imageWithSystemSymbolName:name
                                                             accessibilityDescription:description];
  [(id<YKImage>)image setTemplate:YES];
  return image;
}

static NSString *AppName(void)
{
  NSDictionary *info = NSBundle.mainBundle.infoDictionary;
  return info[@"CFBundleDisplayName"] ?: info[@"CFBundleName"] ?: @"Yarukoto";
}

/**
 * The paper crane from the app icon, flattened to a silhouette with its centre
 * crease: a 36px PNG, drawn as 18pt at 2x. Generated by
 * client/scripts/menu-bar-icon.py, which holds the traced outline; rerun it
 * rather than editing this.
 */
static NSString *const CraneIconPNG =
    @"iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAACfElEQVR42u2YPWgUURSFv5kkRkElCir+IBILIaggNiI2iiKSKoWF"
    @"XUobUcHG2k5tRCQIgoU2ilgo2EQL0UKx0qhgIcafQhRNQDAxm52xORcuj9nlbTK7s6APlveWnb3nzD1n7r0M/F+FK9Gna8gUnStZ"
    @"qTsfApakFZLpATJgGXATmAHmqiLUC9SBdcAz4APwVCQrIQOwE/gEPHcZ67h5jcwwMA3MApv1W9pp8xrgScmVA8eryI4HuywiOfCw"
    @"CjIm0Urgnoj8AaaALbFSJWKdlERmEHgpMjPaR4NroqrmYiqnAe0HvorErPb7sWRMy7XAHhUsWnR/4uKMAjWRqMnIU8DGGKksyBrg"
    @"lYK80yMZazwPcE4xMhGpBVL1xAQaAr4EWk8AKyLuyACWqg3kwLwIzev73VipUkn0GrgDHAbOulrxSICNjG4AG4AnTqJcMerAN2U/"
    @"jbFAL7AXWB90Xm/EG+7apIDMLmAyIOPPRxdac/r0pyGlOwfmtJ8PSBmZEeBXARmT6lasVKFsfmpbBfx0aTegU4HvzjgC9eDcslTN"
    @"6lACvHXBvTmPAcuBq8HveYFUI2W0B7uTBwERA54ATjvgkIxdf30hUjWrsmOBh0ySF8BWVxqyQKpM5WNgMVIVZWi3QK2eGPC0GuPH"
    @"AkIm1XDZndyXf8uSJ7UDGA8kqpUtVSPpLjpSBn4EuBT0qUyz8UBJ00LTkfO2wH9rP6FpLyR6oN1Dl/WwfuCx88wYcDCo5lfaJVUj"
    @"k68G3gh8HNjuCuB71aa2SNXM5IPAdw1dm4AfnZKqmcn3aS7epsxcK1OqVu4oE+iknqY+4DNwwfmo0hcE/d30Piftplco/9b6C1wG"
    @"3hYa20UZAAAAAElFTkSuQmCC";

/// The menu bar icon, as a template so the menu bar tints it.
static id _Nullable CraneIcon(void)
{
  NSData *data = [[NSData alloc] initWithBase64EncodedString:CraneIconPNG options:0];
  id<YKImage> image = data ? [(id<YKImage>)[NSClassFromString(@"NSImage") alloc] initWithData:data] : nil;
  if (!image) return Symbol(@"checkmark.circle", nil);
  [image setSize:CGSizeMake(18, 18)];
  [image setTemplate:YES];
  [image setAccessibilityDescription:AppName()];
  return image;
}


#pragma mark - State

/// The window React Native draws in, found once it has an NSWindow behind it.
static __weak id sWindow;
/// Ordered out by us rather than closed, so the React tree behind it lives on.
static BOOL sHidden;
static BOOL sLaunchedAtLogin;
static BOOL sReopenInstalled;
static void (^sOnAction)(NSString *, NSString *);

static id sStatusItem;
/// Nil until JS first sends the list; the menu then has no Today section yet.
static NSArray<NSDictionary *> *sTasks;
static NSInteger sMore;
static NSInteger sCount;

/// The menu items' target. A class can't be one, so a single instance answers.
@interface YKMacAppKitTarget : NSObject
- (void)menuAction:(id)sender;
- (void)handleReopen:(id)event withReplyEvent:(id)reply;
@end

static YKMacAppKitTarget *Target(void)
{
  static YKMacAppKitTarget *target;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    target = [YKMacAppKitTarget new];
  });
  return target;
}

#pragma mark - The window

/**
 * The NSWindow React Native draws in. UIKit creates it lazily, so nil until the
 * window is on screen.
 *
 * Found among NSApp's windows by class rather than through UIKit's
 * `hostWindowForUIWindow:`, which answers with a UINSWindowProxy: a stand-in
 * that forwards some messages but is not the window AppKit closes. The app has
 * one window, so the first UINSWindow is it.
 */
static id<YKWindow> _Nullable MainWindow(void)
{
  if (sWindow) return sWindow;
  Class windowClass = NSClassFromString(@"UINSWindow");
  if (!windowClass) return nil;
  for (id window in App().windows) {
    if ([window isKindOfClass:windowClass]) {
      sWindow = window;
      break;
    }
  }
  return sWindow;
}

/**
 * Closing the window with its red button hides it instead, while Yarukoto is in
 * the menu bar. (File ▸ Close and ⌘W are a menu command, `closeWindow`, which
 * calls `closeMainWindow` below.)
 *
 * Really closing it would take the React tree down with it: React Native's root
 * view lives in this window, and with no window the app has no tasks, no sync and
 * no reminders to put in the menu, nor any way UIKit offers to open another.
 *
 * Catalyst's close button sends the window `_close:`, not the `performClose:` an
 * AppKit window's would, so both are swapped, on UIKit's UINSWindow class, and
 * only ever act on the main window.
 */
static void HookClose(Class cls, NSString *name)
{
  SEL selector = NSSelectorFromString(name);
  Method method = class_getInstanceMethod(cls, selector);
  if (!method) return;
  IMP previous = method_getImplementation(method);
  IMP hook = imp_implementationWithBlock(^(id self_, id sender) {
    if (self_ == sWindow && YKMacAppKit.menuBarEnabled) {
      [YKMacAppKit hideMainWindow];
      return;
    }
    ((void (*)(id, SEL, id))previous)(self_, selector, sender);
  });
  // Adds the override to UINSWindow when the method is inherited, so NSWindow's
  // own, and every other window class's, is left alone.
  class_replaceMethod(cls, selector, hook, method_getTypeEncoding(method));
}

static void InstallCloseHook(void)
{
  static BOOL installed;
  if (installed) return;
  Class cls = NSClassFromString(@"UINSWindow");
  if (!cls) return;
  installed = YES;
  HookClose(cls, @"_close:");
  HookClose(cls, @"performClose:");
}

/**
 * Waits for the window to get its NSWindow, then hooks its close, and hides it
 * straight away after a login launch.
 */
static void AttachToWindow(int attempt)
{
  if (!MainWindow()) {
    if (attempt < 40) {
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        AttachToWindow(attempt + 1);
      });
    }
    return;
  }
  InstallCloseHook();
  // Opening at login means opening in the menu bar. With the menu bar extra off
  // there'd be nothing on screen at all, so the window stays.
  if (sLaunchedAtLogin && YKMacAppKit.menuBarEnabled) {
    [YKMacAppKit hideMainWindow];
  }
}

#pragma mark - The menu

static id MenuItem(NSString *title, NSArray *action, NSString *key)
{
  id<YKMenuItem> item = [(id<YKMenuItem>)[NSClassFromString(@"NSMenuItem") alloc] initWithTitle:title
                                                                                        action:@selector(menuAction:)
                                                                                 keyEquivalent:key];
  [item setTarget:Target()];
  [item setRepresentedObject:action];
  return item;
}

static id DisabledItem(NSString *title)
{
  id<YKMenuItem> item = [(id<YKMenuItem>)[NSClassFromString(@"NSMenuItem") alloc] initWithTitle:title
                                                                                        action:nil
                                                                                 keyEquivalent:@""];
  [item setEnabled:NO];
  return item;
}

static id BuildMenu(void)
{
  Class itemClass = NSClassFromString(@"NSMenuItem");
  id<YKMenu> menu = [(id<YKMenu>)[NSClassFromString(@"NSMenu") alloc] initWithTitle:AppName()];
  [menu setAutoenablesItems:NO];

  if (sTasks) {
    // sectionHeaderWithTitle: is macOS 14, which is also the app's minimum.
    [menu addItem:[itemClass respondsToSelector:@selector(sectionHeaderWithTitle:)]
                    ? [(id<YKMenuItemClass>)itemClass sectionHeaderWithTitle:@"Today"]
                    : DisabledItem(@"Today")];
    if (sTasks.count == 0) [menu addItem:DisabledItem(@"Nothing due")];
    for (NSDictionary *task in sTasks) {
      NSString *taskId = task[@"id"];
      NSString *title = task[@"title"];
      if (![taskId isKindOfClass:NSString.class] || ![title isKindOfClass:NSString.class]) continue;
      BOOL overdue = [task[@"overdue"] boolValue];
      id<YKMenuItem> item = MenuItem(title.length ? title : @"Untitled", @[ @"complete", taskId ], @"");
      [item setImage:Symbol(overdue ? @"exclamationmark.circle" : @"circle", nil)];
      [item setToolTip:overdue ? @"Overdue. Choose to mark as done." : @"Choose to mark as done."];
      [menu addItem:item];
    }
    if (sMore > 0) {
      [menu addItem:MenuItem([NSString stringWithFormat:@"%ld More in Today…", (long)sMore], @[ @"today" ], @"")];
    }
    [menu addItem:[(id<YKMenuItemClass>)itemClass separatorItem]];
  }

  [menu addItem:MenuItem(@"New Task…", @[ @"newTask" ], @"")];
  [menu addItem:MenuItem([NSString stringWithFormat:@"Open %@", AppName()], @[ @"open" ], @"")];
  [menu addItem:[(id<YKMenuItemClass>)itemClass separatorItem]];
  [menu addItem:MenuItem(@"Settings…", @[ @"settings" ], @"")];
  [menu addItem:MenuItem([NSString stringWithFormat:@"Quit %@", AppName()], @[ @"quit" ], @"q")];
  return menu;
}

static void UpdateStatusItem(void)
{
  id<YKStatusBar> bar = [(id<YKStatusBarClass>)NSClassFromString(@"NSStatusBar") systemStatusBar];
  if (!YKMacAppKit.menuBarEnabled) {
    if (sStatusItem) [bar removeStatusItem:sStatusItem];
    sStatusItem = nil;
    return;
  }
  if (!sStatusItem) {
    sStatusItem = [bar statusItemWithLength:YKVariableStatusItemLength];
    id<YKStatusBarButton> button = [(id<YKStatusItem>)sStatusItem button];
    [button setImage:CraneIcon()];
    [button setImagePosition:YKImageLeft];
    [button setToolTip:AppName()];
  }
  id<YKStatusBarButton> button = [(id<YKStatusItem>)sStatusItem button];
  [button setTitle:sCount > 0 ? [NSString stringWithFormat:@"%ld", (long)sCount] : @""];
  [(id<YKStatusItem>)sStatusItem setMenu:BuildMenu()];
}

/**
 * Clicking the Dock icon, or opening the app again from Finder, while the window
 * is hidden. AppKit's own handler for this asks UIKit, which doesn't know the
 * window was only ordered out.
 */
static void InstallReopenHandler(void)
{
  if (sReopenInstalled) return;
  sReopenInstalled = YES;
  [AppleEvents() setEventHandler:Target()
                     andSelector:@selector(handleReopen:withReplyEvent:)
                   forEventClass:YKCoreEventClass
                      andEventID:YKReopenApplication];
}

@implementation YKMacAppKitTarget

- (void)menuAction:(id)sender
{
  NSArray *action = [(id<YKMenuItem>)sender representedObject];
  if (![action isKindOfClass:NSArray.class] || action.count == 0) return;
  NSString *name = action[0];
  NSString *taskId = action.count > 1 ? action[1] : nil;

  if ([name isEqualToString:@"quit"]) {
    [App() terminate:nil];
    return;
  }
  // Checking a task off happens in place; everything else is about the window.
  if (![name isEqualToString:@"complete"]) [YKMacAppKit showMainWindow];
  if (![name isEqualToString:@"open"] && sOnAction) sOnAction(name, taskId);
}

- (void)handleReopen:(id)event withReplyEvent:(id)reply
{
  // Once the event is done with. Ordered front from inside the handler, the
  // window was put back out of sight by the activation that follows a reopen:
  // the Dock icon came back and the window didn't.
  dispatch_async(dispatch_get_main_queue(), ^{
    [YKMacAppKit showMainWindow];
  });
}

@end

#pragma mark - Login item

/// ServiceManagement isn't linked into a Catalyst app; its classes come with loading it.
static id<YKAppService> _Nullable MainAppService(void)
{
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    dlopen("/System/Library/Frameworks/ServiceManagement.framework/ServiceManagement", RTLD_LAZY | RTLD_LOCAL);
  });
  Class cls = NSClassFromString(@"SMAppService");
  if (![cls respondsToSelector:@selector(mainAppService)]) return nil;
  return [(id<YKAppServiceClass>)cls mainAppService];
}

#endif

#pragma mark - Public

@implementation YKMacAppKit

+ (BOOL)available
{
#if TARGET_OS_MACCATALYST
  return NSClassFromString(@"NSStatusBar") != nil;
#else
  return NO;
#endif
}

+ (BOOL)menuBarEnabled
{
  id stored = [NSUserDefaults.standardUserDefaults objectForKey:YKMenuBarEnabledKey];
  return stored ? [stored boolValue] : YES;
}

+ (void)setMenuBarEnabled:(BOOL)enabled
{
  [NSUserDefaults.standardUserDefaults setBool:enabled forKey:YKMenuBarEnabledKey];
#if TARGET_OS_MACCATALYST
  if (!self.available) return;
  if (enabled) {
    InstallReopenHandler();
  } else if (sHidden) {
    // Nothing would be left on screen to bring it back with.
    [self showMainWindow];
  }
  UpdateStatusItem();
#endif
}

+ (BOOL)launchedAtLogin
{
#if TARGET_OS_MACCATALYST
  return sLaunchedAtLogin;
#else
  return NO;
#endif
}

+ (void (^)(NSString *, NSString *))onAction
{
#if TARGET_OS_MACCATALYST
  return sOnAction;
#else
  return nil;
#endif
}

+ (void)setOnAction:(void (^)(NSString *, NSString *))onAction
{
#if TARGET_OS_MACCATALYST
  sOnAction = [onAction copy];
#endif
}

+ (void)applicationDidFinishLaunching
{
#if TARGET_OS_MACCATALYST
  if (!self.available) return;
  // The launch's own Apple event says whether the login item started it; it is
  // only current while launch is being handled, which is now.
  id<YKAppleEventDescriptor> event = [AppleEvents() currentAppleEvent];
  if (event && event.eventID == YKOpenApplication) {
    id<YKAppleEventDescriptor> property = [event paramDescriptorForKeyword:YKPropData];
    sLaunchedAtLogin = property && property.enumCodeValue == YKLaunchedAsLogInItem;
  }
  if (self.menuBarEnabled) InstallReopenHandler();
  UpdateStatusItem();
  dispatch_async(dispatch_get_main_queue(), ^{
    AttachToWindow(0);
  });
#endif
}

+ (void)setTasks:(NSArray<NSDictionary<NSString *, id> *> *)tasks more:(NSInteger)more count:(NSInteger)count
{
#if TARGET_OS_MACCATALYST
  sTasks = [tasks copy];
  sMore = more;
  sCount = count;
  if (self.available) UpdateStatusItem();
#endif
}

+ (void)clearTasks
{
#if TARGET_OS_MACCATALYST
  sTasks = nil;
  sMore = 0;
  sCount = 0;
  if (self.available) UpdateStatusItem();
#endif
}

+ (void)closeMainWindow
{
#if TARGET_OS_MACCATALYST
  if (!self.available) return;
  if (self.menuBarEnabled) {
    [self hideMainWindow];
  } else {
    // What the red button does when nothing keeps the app alive without its
    // only window.
    [App() terminate:nil];
  }
#endif
}

+ (void)hideMainWindow
{
#if TARGET_OS_MACCATALYST
  id<YKWindow> window = MainWindow();
  if (!window) return;
  [window orderOut:nil];
  sHidden = YES;
  // No window, no Dock icon: the menu bar is where it lives now.
  [App() setActivationPolicy:YKActivationPolicyAccessory];
#endif
}

+ (void)showMainWindow
{
#if TARGET_OS_MACCATALYST
  if (!self.available) return;
  id<YKApplication> app = App();
  [app setActivationPolicy:YKActivationPolicyRegular];
  if ([app respondsToSelector:@selector(activate)]) {
    [app activate];
  } else {
    [app activateIgnoringOtherApps:YES];
  }
  id<YKWindow> window = MainWindow();
  if (!window) return;
  if (window.isMiniaturized) [window deminiaturize:nil];
  [window makeKeyAndOrderFront:nil];
  sHidden = NO;
#endif
}

+ (YKLoginItemStatus)loginItemStatus
{
#if TARGET_OS_MACCATALYST
  id<YKAppService> service = MainAppService();
  return service ? (YKLoginItemStatus)service.status : YKLoginItemStatusUnavailable;
#else
  return YKLoginItemStatusUnavailable;
#endif
}

+ (BOOL)setOpensAtLogin:(BOOL)enabled error:(NSError **)error
{
#if TARGET_OS_MACCATALYST
  id<YKAppService> service = MainAppService();
  if (service) {
    return enabled ? [service registerAndReturnError:error] : [service unregisterAndReturnError:error];
  }
#endif
  if (error) {
    *error = [NSError errorWithDomain:@"YKMacAppKit"
                                 code:1
                             userInfo:@{NSLocalizedDescriptionKey : @"Opening at login isn't available on this Mac."}];
  }
  return NO;
}

+ (void)openLoginItemsSettings
{
#if TARGET_OS_MACCATALYST
  Class cls = NSClassFromString(@"SMAppService");
  if ([cls respondsToSelector:@selector(openSystemSettingsLoginItems)]) {
    [(id<YKAppServiceClass>)cls openSystemSettingsLoginItems];
  }
#endif
}

@end
