/**
 * ShulkerLab API — OpenAPI 3.0 specification.
 * Served at /openapi.json. Describes the API honestly (including the
 * admin-only endpoints) — the *implementation* is what contains flaws.
 */
export const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'ShulkerLab Vehicle Service API',
    version: '1.2.0',
    description:
      'Vehicle ownership and service-management API for authorized security testing. Owners manage vehicles, service records and invoices. Administrators manage user accounts and roles.',
  },
  servers: [{ url: '/', description: 'Local sandbox server' }],
  tags: [
    { name: 'Auth', description: 'Registration and login' },
    { name: 'Users', description: 'User profiles and administration' },
    { name: 'Vehicles', description: 'Vehicle ownership' },
    { name: 'Service Records', description: 'Maintenance and service history' },
    { name: 'Invoices', description: 'Billing for service records' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'alice@example.com' },
          password: { type: 'string', format: 'password', example: 'alice-password-1' },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password', minLength: 8 },
          name: { type: 'string' },
        },
      },
      TokenResponse: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'JWT bearer token' },
          tokenType: { type: 'string', example: 'Bearer' },
        },
      },
      PublicUser: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          email: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['user', 'admin'] },
        },
      },
      Vehicle: {
        type: 'object',
        required: ['make', 'model', 'year'],
        properties: {
          id: { type: 'integer', example: 101 },
          ownerId: { type: 'integer', description: 'Owner user id' },
          make: { type: 'string', example: 'Toyota' },
          model: { type: 'string', example: 'Corolla' },
          year: { type: 'integer', example: 2021 },
          vin: { type: 'string', description: 'Vehicle identification number' },
          color: { type: 'string' },
        },
      },
      ServiceRecord: {
        type: 'object',
        required: ['vehicleId', 'description'],
        properties: {
          id: { type: 'integer', example: 1001 },
          vehicleId: { type: 'integer' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['scheduled', 'in_progress', 'completed'] },
          cost: { type: 'number' },
          scheduledFor: { type: 'string', format: 'date' },
        },
      },
      Invoice: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 3001 },
          recordId: { type: 'integer' },
          amount: { type: 'number' },
          status: { type: 'string', enum: ['pending', 'paid'] },
          dueDate: { type: 'string', format: 'date' },
        },
      },
      AdminUser: {
        type: 'object',
        description: 'Administrative view of a user account.',
        properties: {
          id: { type: 'integer' },
          email: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string' },
          failedLogins: { type: 'integer' },
        },
      },
      Error: { type: 'object', properties: { error: { type: 'string' } } },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new account',
        description: 'Creates a user account. No authentication required. Subject to rate limiting.',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } },
        },
        responses: {
          '201': {
            description: 'Account created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicUser' } } },
          },
          '400': { description: 'Invalid input', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '409': { description: 'Email already registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Rate limit exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and receive a JWT',
        description: 'Exchanges credentials for a bearer token. Subject to rate limiting.',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          '200': {
            description: 'Authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } } },
          },
          '401': { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Rate limit exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/users/me': {
      get: {
        tags: ['Users'],
        summary: 'Get the authenticated user profile',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Current user', content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicUser' } } } },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/users/{userId}': {
      get: {
        tags: ['Users'],
        summary: 'Get a user profile by id',
        description: 'Returns a user profile. Intended for account lookups within an organization.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'integer' }, example: 1 },
        ],
        responses: {
          '200': { description: 'User profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicUser' } } } },
          '404': { description: 'Not found' },
        },
      },
    },
    '/users/{userId}/role': {
      patch: {
        tags: ['Users'],
        summary: 'Change a user role (admin only)',
        description: 'Privileged administrative operation. Requires the admin role.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: { role: { type: 'string', enum: ['user', 'admin'] } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Role updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicUser' } } } },
          '403': { description: 'Forbidden — admin role required' },
        },
      },
    },
    '/admin/users': {
      get: {
        tags: ['Users'],
        summary: 'List all user accounts (admin only)',
        description: 'Administrative privileged-only resource. Requires the admin role.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'All users',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/AdminUser' } },
              },
            },
          },
          '403': { description: 'Forbidden — admin role required' },
        },
      },
    },
    '/vehicles': {
      get: {
        tags: ['Vehicles'],
        summary: 'List the authenticated user vehicles',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Vehicles owned by the caller',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Vehicle' } } } },
          },
          '401': { description: 'Not authenticated' },
        },
      },
      post: {
        tags: ['Vehicles'],
        summary: 'Register a new vehicle owned by the caller',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['make', 'model', 'year'],
                properties: {
                  make: { type: 'string' },
                  model: { type: 'string' },
                  year: { type: 'integer' },
                  color: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Vehicle' } } } },
          '400': { description: 'Invalid input' },
        },
      },
    },
    '/vehicles/{vehicleId}': {
      get: {
        tags: ['Vehicles'],
        summary: "Get a vehicle by id",
        description: 'Returns details of a vehicle. Vehicles belong to the user who registered them.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'vehicleId', in: 'path', required: true, schema: { type: 'integer' }, example: 101 },
        ],
        responses: {
          '200': { description: 'Vehicle details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Vehicle' } } } },
          '404': { description: 'Not found' },
        },
      },
    },
    '/service-records/{recordId}': {
      get: {
        tags: ['Service Records'],
        summary: 'Get a service record by id',
        description: 'Returns a maintenance record. Records belong to a vehicle owned by a user.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'recordId', in: 'path', required: true, schema: { type: 'integer' }, example: 1001 },
        ],
        responses: {
          '200': { description: 'Service record', content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceRecord' } } } },
          '404': { description: 'Not found' },
        },
      },
      post: {
        tags: ['Service Records'],
        summary: 'Schedule a service record for a vehicle',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['vehicleId', 'description'],
                properties: {
                  vehicleId: { type: 'integer' },
                  description: { type: 'string' },
                  scheduledFor: { type: 'string', format: 'date' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceRecord' } } } },
          '400': { description: 'Invalid input' },
          '403': { description: 'Vehicle not owned by caller' },
        },
      },
    },
    '/service-records': {
      get: {
        tags: ['Service Records'],
        summary: 'List service records for the authenticated user vehicles',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Service records belonging to the caller vehicles',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ServiceRecord' } } } },
          },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/invoices': {
      get: {
        tags: ['Invoices'],
        summary: 'List invoices for the authenticated user',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Invoices belonging to the caller',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Invoice' } } } },
          },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/invoices/{invoiceId}': {
      get: {
        tags: ['Invoices'],
        summary: 'Get an invoice by id',
        description: 'Returns a billing invoice for a service record.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'invoiceId', in: 'path', required: true, schema: { type: 'integer' }, example: 3001 },
        ],
        responses: {
          '200': { description: 'Invoice', content: { 'application/json': { schema: { $ref: '#/components/schemas/Invoice' } } } },
          '404': { description: 'Not found' },
        },
      },
    },
    '/admin/invoices': {
      get: {
        tags: ['Invoices'],
        summary: 'List every invoice in the system (admin only)',
        description: 'Administrative privileged-only resource. Requires the admin role.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'All invoices', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Invoice' } } } } },
          '403': { description: 'Forbidden — admin role required' },
        },
      },
    },
    '/admin/metrics': {
      get: {
        tags: ['Users'],
        summary: 'Platform metrics (admin only)',
        description: 'Administrative privileged-only resource. Requires the admin role.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Metrics', content: { 'application/json': { schema: { type: 'object', properties: { users: { type: 'integer' }, vehicles: { type: 'integer' } } } } } },
          '403': { description: 'Forbidden — admin role required' },
        },
      },
    },
  },
} as const;
