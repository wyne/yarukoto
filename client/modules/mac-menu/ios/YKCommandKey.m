#import "YKCommandKey.h"

#import <TargetConditionals.h>

#if TARGET_OS_MACCATALYST

#pragma mark - NSEvent, as far as this file needs it

// Constants copied from AppKit's NSEvent.h, as YKMacAppKit.m copies its own.
static const unsigned long long YKEventMaskLeftMouseDown = 1ULL << 1;
static const unsigned long long YKEventMaskRightMouseDown = 1ULL << 3;
static const unsigned long long YKEventMaskKeyDown = 1ULL << 10;
static const unsigned long long YKEventMaskFlagsChanged = 1ULL << 12;
static const NSUInteger YKEventTypeFlagsChanged = 12;
static const NSUInteger YKModifierShift = 1 << 17;
static const NSUInteger YKModifierControl = 1 << 18;
static const NSUInteger YKModifierOption = 1 << 19;
static const NSUInteger YKModifierCommand = 1 << 20;

@protocol YKEventClass <NSObject>
- (nullable id)addLocalMonitorForEventsMatchingMask:(unsigned long long)mask handler:(id _Nullable (^)(id event))block;
- (void)removeMonitor:(id)monitor;
@end

@protocol YKEvent <NSObject>
- (NSUInteger)type;
- (NSUInteger)modifierFlags;
@end

static id<YKEventClass> _Nullable Events(void)
{
  return (id<YKEventClass>)NSClassFromString(@"NSEvent");
}

static id _Nullable monitor;
static BOOL held;
static void (^_Nullable handler)(BOOL);

@implementation YKCommandKey

+ (void)watch:(void (^)(BOOL))onChange
{
  if (monitor) {
    [Events() removeMonitor:monitor];
    monitor = nil;
  }
  held = NO;
  handler = [onChange copy];
  if (!handler || !Events()) return;

  unsigned long long mask =
      YKEventMaskFlagsChanged | YKEventMaskKeyDown | YKEventMaskLeftMouseDown | YKEventMaskRightMouseDown;
  // Watched, never consumed: the event goes on to whatever it was for.
  monitor = [Events() addLocalMonitorForEventsMatchingMask:mask
                                                   handler:^id _Nullable(id event) {
    id<YKEvent> e = event;
    BOOL alone = NO;
    if (e.type == YKEventTypeFlagsChanged) {
      NSUInteger modifiers =
          e.modifierFlags & (YKModifierShift | YKModifierControl | YKModifierOption | YKModifierCommand);
      alone = modifiers == YKModifierCommand;
    }
    if (alone != held) {
      held = alone;
      if (handler) handler(alone);
    }
    return event;
  }];
}

@end

#else

@implementation YKCommandKey

+ (void)watch:(void (^)(BOOL))onChange
{
}

@end

#endif
