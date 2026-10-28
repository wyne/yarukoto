#import "YKSwitcherKeys.h"

#import <TargetConditionals.h>

#if TARGET_OS_MACCATALYST

#pragma mark - NSEvent, as far as this file needs it

// Constants copied from AppKit's NSEvent.h and Events.h, as YKCommandKey.m copies its own.
static const unsigned long long YKEventMaskKeyDown = 1ULL << 10;
static const unsigned long long YKEventMaskFlagsChanged = 1ULL << 12;
static const NSUInteger YKEventTypeKeyDown = 10;
static const NSUInteger YKEventTypeFlagsChanged = 12;
static const NSUInteger YKModifierShift = 1 << 17;
static const NSUInteger YKModifierControl = 1 << 18;
static const NSUInteger YKModifierOption = 1 << 19;
static const NSUInteger YKModifierCommand = 1 << 20;
// Physical keys, so ` is the key left of 1 whatever the layout types with it.
static const unsigned short YKKeyCodeTab = 48;
static const unsigned short YKKeyCodeGrave = 50;

@protocol YKSwitcherEventClass <NSObject>
- (nullable id)addLocalMonitorForEventsMatchingMask:(unsigned long long)mask handler:(id _Nullable (^)(id event))block;
- (void)removeMonitor:(id)monitor;
@end

@protocol YKSwitcherEvent <NSObject>
- (NSUInteger)type;
- (NSUInteger)modifierFlags;
- (unsigned short)keyCode;
@end

static id<YKSwitcherEventClass> _Nullable Events(void)
{
  return (id<YKSwitcherEventClass>)NSClassFromString(@"NSEvent");
}

static id _Nullable monitor;
/** A step was taken and ⌃ hasn't come up since. */
static BOOL switching;
static void (^_Nullable stepHandler)(NSInteger);
static void (^_Nullable releaseHandler)(void);

@implementation YKSwitcherKeys

+ (void)watchSteps:(void (^)(NSInteger))onStep released:(void (^)(void))onRelease
{
  if (monitor) {
    [Events() removeMonitor:monitor];
    monitor = nil;
  }
  switching = NO;
  stepHandler = [onStep copy];
  releaseHandler = [onRelease copy];
  if (!stepHandler || !Events()) return;

  monitor = [Events() addLocalMonitorForEventsMatchingMask:YKEventMaskKeyDown | YKEventMaskFlagsChanged
                                                   handler:^id _Nullable(id event) {
    id<YKSwitcherEvent> e = event;
    NSUInteger modifiers = e.modifierFlags & (YKModifierShift | YKModifierControl | YKModifierOption | YKModifierCommand);
    if (e.type == YKEventTypeFlagsChanged) {
      if (switching && !(modifiers & YKModifierControl)) {
        switching = NO;
        if (releaseHandler) releaseHandler();
      }
      return event;
    }
    if (e.type != YKEventTypeKeyDown) return event;
    // ⌃ with or without ⇧, and nothing else held.
    if ((modifiers & ~YKModifierShift) != YKModifierControl) return event;
    if (e.keyCode != YKKeyCodeTab && e.keyCode != YKKeyCodeGrave) return event;
    switching = YES;
    BOOL backwards = (modifiers & YKModifierShift) || e.keyCode == YKKeyCodeGrave;
    if (stepHandler) stepHandler(backwards ? -1 : 1);
    // Taken: a field or the window's key loop would otherwise move focus with it.
    return nil;
  }];
}

@end

#else

@implementation YKSwitcherKeys

+ (void)watchSteps:(void (^)(NSInteger))onStep released:(void (^)(void))onRelease
{
}

@end

#endif
