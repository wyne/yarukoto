#import <Foundation/Foundation.h>
#import <React/RCTConstants.h>

/**
 * Turns on React Native's W3C pointer events on the Mac.
 *
 * With them off — React Native's default on iOS — the surface never installs its
 * pointer handler, so no view hears onPointerEnter, onPointerLeave or anything
 * else a mouse does, and hover has nothing to go on. The switch is read once,
 * when the first surface's touch handler is created, so it has to be set before
 * React Native starts; +load runs as the binary is loaded, ahead of any of it.
 *
 * Mac only: a phone or an iPad has no reason to pay for pointer dispatch on every
 * touch, and nothing there listens for it.
 */
@interface MacPointerEvents : NSObject
@end

@implementation MacPointerEvents

+ (void)load
{
  if (NSProcessInfo.processInfo.isMacCatalystApp) {
    RCTSetDispatchW3CPointerEvents(YES);
  }
}

@end
