/**
 * OpenAPI 3.0/3.1 (and Swagger 2.0) ingestion → ApiSpecModel.
 * Tolerant of unusual-but-valid documents; rejects clearly invalid ones
 * with a structured error so scans fail with INVALID_OPENAPI, not a crash.
 */
import YAML from 'yaml';
import type { ApiSpecModel, EndpointModel, ParamModel } from '@shulker/shared';


export class InvalidOpenApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOpenApiError';
  }
}

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** Resolve a local $ref like '#/components/schemas/User' against the document. */
function resolveRef(doc: unknown, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined;
  let cur: unknown = doc;
  for (const seg of ref.slice(2).split('/')) {
    if (!isRecord(cur)) return undefined;
    cur = cur[seg.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return cur;
}

function deref(node: unknown, doc: unknown, depth = 0): unknown {
  if (depth > 12) return node;
  if (isRecord(node) && typeof node.$ref === 'string') {
    return deref(resolveRef(doc, node.$ref), doc, depth + 1);
  }
  return node;
}

function collectResponseProps(op: Record<string, unknown>, doc: unknown): string[] {
  const responses = isRecord(op.responses) ? op.responses : {};
  for (const code of Object.keys(responses).sort()) {
    const resp = deref(responses[code], doc);
    if (!isRecord(resp)) continue;
    const content = isRecord(resp.content) ? resp.content : {};
    const json = deref(content['application/json'], doc);
    if (!isRecord(json)) continue;
    const schema = deref(json.schema, doc);
    return schemaProps(schema, doc);
  }
  return [];
}

function schemaProps(schema: unknown, doc: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  const s = deref(schema, doc);
  if (!isRecord(s)) return [];
  if (s.type === 'array') return schemaProps(s.items, doc, depth + 1);
  const props = isRecord(s.properties) ? s.properties : {};
  return Object.keys(props);
}

function paramToModel(p: unknown): ParamModel {
  const param = deref(p, {});
  if (!isRecord(param)) return { name: 'unknown', in: 'path', type: 'string', required: false };
  const schema = deref(param.schema, {});
  const type = isRecord(schema) && typeof schema.type === 'string' ? schema.type : 'string';
  return {
    name: asString(param.name, 'unknown'),
    in: asString(param.in, 'path'),
    type,
    required: param.required === true || param.in === 'path',
  };
}

function summarize(doc: Record<string, unknown>): { title: string; version: string; serverUrl?: string } {
  const info = isRecord(doc.info) ? doc.info : {};
  let serverUrl: string | undefined;
  if (Array.isArray(doc.servers) && isRecord(doc.servers[0])) {
    serverUrl = asString((doc.servers[0] as Record<string, unknown>).url) || undefined;
  } else if (typeof doc.host === 'string') {
    // Swagger 2.0
    const basePath = asString(doc.basePath, '/');
    const scheme = Array.isArray(doc.schemes) && typeof doc.schemes[0] === 'string' ? doc.schemes[0] : 'https';
    serverUrl = `${scheme}://${doc.host}${basePath}`;
  }
  return {
    title: asString(info.title, 'Untitled API'),
    version: asString(info.version, '0.0.0'),
    serverUrl,
  };
}

export function parseSpecText(text: string): ApiSpecModel {
  let doc: unknown;
  try {
    doc = YAML.parse(text, { merge: true });
  } catch (err) {
    throw new InvalidOpenApiError(`Specification is not valid YAML/JSON: ${(err as Error).message}`);
  }
  if (!isRecord(doc)) {
    throw new InvalidOpenApiError('Specification root must be an object.');
  }
  const hasV3 = typeof doc.openapi === 'string' && doc.openapi.startsWith('3');
  const hasV2 = typeof doc.swagger === 'string' && doc.swagger.startsWith('2');
  if (!hasV3 && !hasV2) {
    throw new InvalidOpenApiError('Missing OpenAPI "openapi: 3.x" or Swagger "swagger: 2.0" version field.');
  }
  if (!isRecord(doc.paths)) {
    throw new InvalidOpenApiError('Specification has no "paths" object.');
  }

  const { title, version, serverUrl } = summarize(doc);

  // Swagger 2.0 security definitions: figure out if bearer-ish auth is used.
  let v2HasBearer = false;
  if (hasV2 && isRecord(doc.securityDefinitions)) {
    for (const def of Object.values(doc.securityDefinitions)) {
      if (isRecord(def) && (def.type === 'apiKey' && asString(def.in) === 'header' || def.type === 'basic' || def.type === 'oauth2')) {
        v2HasBearer = true;
      }
    }
  }
  const globalSecurity = Array.isArray(doc.security) && doc.security.length > 0;

  const endpoints: EndpointModel[] = [];
  for (const [rawPath, pathItemUnknown] of Object.entries(doc.paths)) {
    if (!rawPath.startsWith('/')) continue;
    const pathItem = deref(pathItemUnknown, doc);
    if (!isRecord(pathItem)) continue;
    const pathLevelParams = Array.isArray(pathItem.parameters)
      ? (pathItem.parameters as unknown[]).map(paramToModel)
      : [];

    for (const method of Object.keys(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue;
      const opUnknown = pathItem[method];
      const op = deref(opUnknown, doc);
      if (!isRecord(op)) continue;

      const opParams = Array.isArray(op.parameters)
        ? (op.parameters as unknown[]).map(paramToModel)
        : [];
      const seen = new Set<string>();
      const params: ParamModel[] = [...pathLevelParams, ...opParams].filter((p) => {
        const k = `${p.in}:${p.name}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      // Auth: explicit per-op security=[] wins; else op-level security; else global.
      let auth: EndpointModel['auth'] = 'none';
      if (Array.isArray(op.security)) {
        auth = op.security.length > 0 ? inferAuthType(op.security, doc) : 'none';
      } else if (globalSecurity) {
        auth = inferAuthType(doc.security as unknown[], doc);
      } else if (hasV2 && v2HasBearer && !op.security) {
        auth = 'other';
      }

      const idParam = params.find((p) => p.in === 'path')?.name;
      const bodySchema = isRecord(op.requestBody)
        ? deref((op.requestBody as Record<string, unknown>).requestBody ?? op.requestBody, doc)
        : undefined;
      let requestSchemaRef: string | undefined;
      const rb = op.requestBody;
      if (isRecord(rb)) {
        const content = isRecord(rb.content) ? rb.content : {};
        const json = deref(content['application/json'], doc);
        if (isRecord(json) && isRecord(json.schema)) {
          requestSchemaRef = schemaName(json.schema, doc);
        }
      } else if (Array.isArray(op.parameters)) {
        // Swagger 2.0 body parameter
        const bodyParam = (op.parameters as unknown[] | undefined)?.find((p) => {
          const d = deref(p, {});
          return isRecord(d) && d.in === 'body';
        });
        if (bodyParam) {
          const d = deref(bodyParam, {});
          if (isRecord(d) && isRecord(d.schema)) requestSchemaRef = schemaName(d.schema, doc);
        }
      }
      void bodySchema;

      const summary = asString(op.summary);
      const description = asString(op.description);
      const adminLikely =
        /admin|privileged|internal/i.test(`${summary} ${description} ${rawPath}`) ||
        /admin.{0,12}(only|role|required)/i.test(description) ||
        rawPath.startsWith('/admin');

      endpoints.push({
        id: `${method.toUpperCase()} ${rawPath}`,
        method: method.toUpperCase(),
        path: rawPath,
        summary,
        description,
        tags: Array.isArray(op.tags) ? (op.tags as unknown[]).map(String) : [],
        auth,
        params,
        requestSchemaRef,
        responseProps: collectResponseProps(op, doc),
        resource: resourceFromPath(rawPath),
        idParam,
        adminLikely,
        modifiesData: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase()),
        isAuthEndpoint: /auth\/(login|register|token)/.test(rawPath),
      });
    }
  }

  if (endpoints.length === 0) {
    throw new InvalidOpenApiError('No HTTP operations found under "paths".');
  }
  return { title, version, serverUrl, endpoints };
}

function inferAuthType(security: unknown[], doc: unknown): EndpointModel['auth'] {
  for (const entry of security) {
    if (!isRecord(entry)) continue;
    for (const schemeName of Object.keys(entry)) {
      const docRec = doc as Record<string, unknown>;
      const scheme = resolveRef(doc, `#/components/securitySchemes/${schemeName}`) ??
        (isRecord(docRec.securityDefinitions) ? (docRec.securityDefinitions as Record<string, unknown>)[schemeName] : undefined);
      const s = deref(scheme, doc);
      if (isRecord(s)) {
        if (s.type === 'http' && s.scheme === 'bearer') return 'bearer';
        if (s.type === 'http' && s.scheme === 'basic') return 'other';
        if (s.type === 'apiKey' && asString(s.in) === 'header') return 'other';
        if (s.type === 'oauth2' || s.type === 'openIdConnect') return 'bearer';
      }
    }
  }
  return 'other';
}

function schemaName(schema: unknown, doc: unknown): string | undefined {
  if (isRecord(schema) && typeof schema.$ref === 'string') {
    return schema.$ref.split('/').pop();
  }
  return undefined;
}

function resourceFromPath(path: string): string {
  const seg = path.split('/').filter(Boolean)[0] ?? '';
  return seg.replace(/[{}]/g, '');
}

/** Parse a spec from an uploaded file buffer based on extension or sniffing. */
export function parseSpecUpload(filename: string, buffer: Buffer): ApiSpecModel {
  const text = buffer.toString('utf8');
  if (/\.(ya?ml)$/i.test(filename) || (!text.trimStart().startsWith('{') && !text.trimStart().startsWith('['))) {
    // YAML path (also handles JSON, since YAML is a superset)
    return parseSpecText(text);
  }
  return parseSpecText(text);
}
