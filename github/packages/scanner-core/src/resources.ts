/**
 * Resource ownership discovery.
 *
 * To test BOLA the scanner needs ground truth about who owns what. It gets
 * this from the target API itself: authenticated GET list endpoints whose
 * responses are arrays of objects with an id are indexed per actor AND per
 * collection path (e.g. /vehicles -> Alice: [101,102], Bob: [202,203]).
 *
 * This is why the scanner never guesses or scans sequential IDs: it asks the
 * API what each actor owns, then tests whether the other actor can read it.
 */
import type { Actor, EndpointModel } from '@shulker/shared';
import type { SafeHttpClient } from './http.ts';

const OWNERSHIP_FIELDS = [
  'ownerId', 'owner_id', 'userId', 'user_id', 'accountId', 'account_id',
  'vehicleId', 'vehicle_id', 'recordId', 'record_id', 'invoiceId', 'invoice_id',
];

export interface OwnedObject {
  id: number | string;
  ownershipField: string;
  ownershipValue: number | string;
  listPath: string;
}

export interface DiscoveryOutcome {
  listEndpointsUsed: string[];
  indexed: number;
  perActor: Record<string, number>;
}

/** Collection path for a detail endpoint: '/vehicles/{id}' -> '/vehicles'. */
export function collectionOf(detailPath: string): string {
  const segs = detailPath.split('/').filter(Boolean);
  const out: string[] = [];
  for (const seg of segs) {
    if (seg.startsWith('{')) break;
    out.push(seg);
  }
  return `/${out.join('/')}`;
}

export class ResourceIndex {
  /** Map<actorUserId, Map<listPath, OwnedObject[]>> */
  private byActor = new Map<number, Map<string, OwnedObject[]>>();
  /** Map<`${objectId}`, ownerUserId> */
  private ownerOf = new Map<string, number>();
  private readonly client: SafeHttpClient;

  constructor(client: SafeHttpClient) {
    this.client = client;
  }

  async discover(endpoints: EndpointModel[], actors: Actor[]): Promise<DiscoveryOutcome> {
    const outcome: DiscoveryOutcome = { listEndpointsUsed: [], indexed: 0, perActor: {} };
    const listEndpoints = endpoints.filter(
      (e) =>
        e.method === 'GET' &&
        e.auth === 'bearer' &&
        !e.idParam &&
        !e.adminLikely &&
        !e.isAuthEndpoint &&
        !/users\/me|^\/users$/.test(e.path),
    );

    for (const listEndpoint of listEndpoints) {
      for (const actor of actors) {
        if (!actor.token) continue;
        const res = await this.client.request(listEndpoint.method, listEndpoint.path, {
          headers: { authorization: `Bearer ${actor.token}` },
        });
        if (res.status !== 200) continue;
        const parsed = safeJson(res.bodyText);
        const items = Array.isArray(parsed) ? parsed : [];
        if (items.length === 0) continue;
        const first = items.find((i) => i && typeof i === 'object' && !Array.isArray(i));
        if (!first) continue;
        const rec = first as Record<string, unknown>;
        if (rec.id === undefined) continue;
        const ownerField = OWNERSHIP_FIELDS.find((f) => f in rec);
        if (!ownerField) continue;
        if (!outcome.listEndpointsUsed.includes(listEndpoint.path)) {
          outcome.listEndpointsUsed.push(listEndpoint.path);
        }
        const actorKey = actor.userId ?? -1;
        const perList = this.byActor.get(actorKey) ?? new Map<string, OwnedObject[]>();
        const bucket = perList.get(listEndpoint.path) ?? [];
        for (const item of items as Array<Record<string, unknown>>) {
          if (item.id === undefined) continue;
          const obj: OwnedObject = {
            id: item.id as number | string,
            ownershipField: ownerField,
            ownershipValue: item[ownerField] as number | string,
            listPath: listEndpoint.path,
          };
          bucket.push(obj);
          this.ownerOf.set(String(obj.id), Number(actorKey));
          outcome.indexed += 1;
          outcome.perActor[actor.label] = (outcome.perActor[actor.label] ?? 0) + 1;
        }
        perList.set(listEndpoint.path, bucket);
        this.byActor.set(actorKey, perList);
      }
    }
    return outcome;
  }

  /** Ids an actor owns that were discovered via the given collection path. */
  idsForList(actorUserId: number, listPath: string): Array<number | string> {
    return (this.byActor.get(actorUserId)?.get(listPath) ?? []).map((o) => o.id);
  }

  isOwnedBy(objectId: number | string, actorUserId: number): boolean {
    return this.ownerOf.get(String(objectId)) === actorUserId;
  }

  total(): number {
    return this.ownerOf.size;
  }
}

export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
