import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpecText, InvalidOpenApiError } from './parser.ts';

// Minimal replica of the ShulkerLab spec for parser tests (keeps the
// scanner-core package self-contained for typechecking).
const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: { title: 'ShulkerLab Vehicle Service API', version: '1.2.0' },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Login', security: [],
        responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { token: { type: 'string' } } } } } } },
      },
    },
    '/users/{userId}': {
      get: {
        tags: ['Users'], summary: 'Get user', security: [{ bearerAuth: [] }],
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' }, email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string' } } } } } } },
      },
    },
    '/vehicles/{vehicleId}': {
      get: {
        tags: ['Vehicles'], summary: 'Get vehicle', security: [{ bearerAuth: [] }],
        parameters: [{ name: 'vehicleId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'ok' } },
      },
    },
    '/admin/users': {
      get: {
        tags: ['Users'], summary: 'List all users (admin only)', description: 'Administrative privileged-only resource. Requires the admin role.', security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'ok' } },
      },
    },
  },
} as const;

test('parses the ShulkerLab spec into an endpoint model', () => {
  const model = parseSpecText(JSON.stringify(OPENAPI_SPEC));
  assert.equal(model.title, 'ShulkerLab Vehicle Service API');
  assert.ok(model.endpoints.length >= 4, `expected >=4 endpoints, got ${model.endpoints.length}`);
  const vehicles = model.endpoints.find((e) => e.path === '/vehicles/{vehicleId}');
  assert.ok(vehicles);
  assert.equal(vehicles!.method, 'GET');
  assert.equal(vehicles!.auth, 'bearer');
  assert.equal(vehicles!.idParam, 'vehicleId');
  const admin = model.endpoints.find((e) => e.path === '/admin/users');
  assert.ok(admin!.adminLikely);
  const login = model.endpoints.find((e) => e.path === '/auth/login');
  assert.equal(login!.auth, 'none');
  assert.ok(login!.isAuthEndpoint);
});

test('rejects garbage with InvalidOpenApiError', () => {
  assert.throws(() => parseSpecText('{"openapi": "3.0.0"}'), InvalidOpenApiError);
  assert.throws(() => parseSpecText('not a spec at all'), InvalidOpenApiError);
  assert.throws(() => parseSpecText(''), InvalidOpenApiError);
});

test('parses YAML specs', () => {
  const yaml = `
openapi: 3.0.0
info:
  title: Mini API
  version: '1.0'
paths:
  /widgets:
    get:
      summary: List widgets
      security: [{ bearerAuth: [] }]
      responses: { '200': { description: ok } }
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
`;
  const model = parseSpecText(yaml);
  assert.equal(model.title, 'Mini API');
  assert.equal(model.endpoints[0]!.auth, 'bearer');
});

test('exposure candidate endpoints include response props', () => {
  const model = parseSpecText(JSON.stringify(OPENAPI_SPEC));
  const user = model.endpoints.find((e) => e.path === '/users/{userId}');
  assert.deepEqual(user!.responseProps.sort(), ['email', 'id', 'name', 'role']);
});