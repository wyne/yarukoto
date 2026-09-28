import { Viewer } from './access';

/**
 * The viewer the auth hook resolved. Throws rather than falling back to
 * anyone: a route reached without the hook is a wiring mistake, and the safe
 * failure for "who is this" is an error, not the owner's view of everything.
 */
export function viewerOf(request: { viewer?: Viewer }): Viewer {
  if (!request.viewer) throw new Error('No viewer on the request; is the auth hook registered?');
  return request.viewer;
}
