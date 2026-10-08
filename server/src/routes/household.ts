import { FastifyInstance, FastifyReply } from 'fastify';
import Database from 'better-sqlite3';
import { viewerOf } from '../viewer';
import {
  ApproveAs,
  HouseholdError,
  approvePairing,
  deleteOwnAccount,
  describeHousehold,
  pollPairing,
  removeMember,
  renameMember,
  restoreMember,
  revokeDevice,
  startPairing,
  whoAmI,
} from '../household';

const STATUS: Record<HouseholdError['code'], number> = {
  not_found: 404,
  bad_request: 400,
  forbidden: 403,
  gone: 410,
  rate_limited: 429,
};

async function respond(reply: FastifyReply, run: () => unknown): Promise<void> {
  try {
    reply.send(run());
  } catch (err) {
    if (err instanceof HouseholdError) {
      reply.code(STATUS[err.code]).send({ error: err.code, message: err.message });
      return;
    }
    throw err;
  }
}

/**
 * The two pairing calls a device makes before it has a token. Registered
 * outside the auth hook: starting only issues a code, and polling yields a
 * token only to whoever holds the secret from the start and after a signed-in
 * person has approved it.
 */
export function registerPairingRoutes(app: FastifyInstance, db: Database.Database): void {
  app.post<{ Body: { name?: string } }>('/api/v1/pair/start', async (request, reply) => {
    await respond(reply, () => startPairing(db, request.body?.name));
  });

  app.post<{ Body: { pairingId?: string; secret?: string } }>('/api/v1/pair/poll', async (request, reply) => {
    await respond(reply, () => pollPairing(db, String(request.body?.pairingId ?? ''), request.body?.secret as string));
  });
}

/** Everything else about the household, for signed-in callers. */
export function registerHouseholdRoutes(app: FastifyInstance, db: Database.Database): void {
  app.post<{ Body: { code?: string; as?: ApproveAs['as']; name?: string } }>(
    '/api/v1/pair/approve',
    async (request, reply) => {
      const body = request.body ?? {};
      const how: ApproveAs =
        body.as === 'member' ? { as: 'member', name: body.name ?? '' } : body.as === 'integration' ? { as: 'integration' } : { as: 'self' };
      await respond(reply, () => approvePairing(db, viewerOf(request), String(body.code ?? ''), how));
    }
  );

  app.get('/api/v1/me', async (request, reply) => {
    await respond(reply, () => whoAmI(db, viewerOf(request)));
  });

  app.delete('/api/v1/me', async (request, reply) => {
    await respond(reply, () => {
      deleteOwnAccount(db, viewerOf(request));
      return { deleted: true };
    });
  });

  app.get('/api/v1/household', async (request, reply) => {
    await respond(reply, () => describeHousehold(db, viewerOf(request)));
  });

  app.patch<{ Params: { id: string }; Body: { name?: string } }>('/api/v1/users/:id', async (request, reply) => {
    await respond(reply, () => ({ member: renameMember(db, viewerOf(request), request.params.id, request.body?.name) }));
  });

  app.delete<{ Params: { id: string } }>('/api/v1/users/:id', async (request, reply) => {
    await respond(reply, () => ({ member: removeMember(db, viewerOf(request), request.params.id) }));
  });

  app.post<{ Params: { id: string } }>('/api/v1/users/:id/restore', async (request, reply) => {
    await respond(reply, () => ({ member: restoreMember(db, viewerOf(request), request.params.id) }));
  });

  app.delete<{ Params: { id: string } }>('/api/v1/devices/:id', async (request, reply) => {
    await respond(reply, () => ({ device: revokeDevice(db, viewerOf(request), request.params.id) }));
  });
}
