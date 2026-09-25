import { DatabaseSync } from 'node:sqlite';
import { SEED_USERS } from './config.ts';
import { hashPassword } from './auth.ts';

export interface UserRow {
  id: number;
  email: string;
  name: string;
  role: string;
  password_hash: string;
  internal_notes: string;
  last_login_ip: string;
  failed_logins: number;
}

export interface VehicleRow {
  id: number;
  owner_id: number;
  make: string;
  model: string;
  year: number;
  vin: string;
  color: string;
}

export interface ServiceRecordRow {
  id: number;
  vehicle_id: number;
  description: string;
  status: string;
  cost: number;
  scheduled_for: string;
}

export interface InvoiceRow {
  id: number;
  record_id: number;
  amount: number;
  status: string;
  due_date: string;
}

export class SandboxDB {
  readonly db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.#migrate();
    this.#seed();
  }

  #migrate(): void {
    this.db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        password_hash TEXT NOT NULL,
        internal_notes TEXT DEFAULT '',
        last_login_ip TEXT DEFAULT '',
        failed_logins INTEGER DEFAULT 0
      );
      CREATE TABLE vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL REFERENCES users(id),
        make TEXT NOT NULL, model TEXT NOT NULL, year INTEGER NOT NULL,
        vin TEXT NOT NULL, color TEXT DEFAULT ''
      );
      CREATE TABLE service_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
        description TEXT NOT NULL, status TEXT NOT NULL,
        cost REAL DEFAULT 0, scheduled_for TEXT DEFAULT ''
      );
      CREATE TABLE invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id INTEGER NOT NULL REFERENCES service_records(id),
        amount REAL NOT NULL, status TEXT NOT NULL, due_date TEXT NOT NULL
      );
    `);
  }

  #seed(): void {
    const ids: Record<string, number> = {};
    for (const u of SEED_USERS) {
      this.db
        .prepare(
          'INSERT INTO users (email, name, role, password_hash, internal_notes, last_login_ip) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(u.username, u.name, u.role, hashPassword(u.password), 'created via support ticket', '127.0.0.1');
      ids[u.username] = Number(
        this.db.prepare('SELECT last_insert_rowid() as id').get()!.id,
      );
    }
    const alice = ids['alice@example.com']!;
    const bob = ids['bob@example.com']!;
    const admin = ids['admin@shulkerlab.io']!;

    // Vehicles: 101+ for Alice, 202+ for Bob, admin has one too (explicit ids
    // so cross-user object ids are stable and human-friendly for demos).
    const vehicles: Array<[number, number, string, string, number, string, string]> = [
      [101, alice, 'Toyota', 'Corolla', 2021, 'JTDBR32E1JM100101', 'silver'],
      [102, alice, 'Honda', 'Civic', 2019, '19XFC2F69KE100102', 'blue'],
      [202, bob, 'Ford', 'Mustang', 2022, '1FA6P8TH1N5100201', 'red'],
      [203, bob, 'Tesla', 'Model 3', 2023, '5YJ3E1EA7P1000202', 'white'],
      [301, admin, 'Polestar', '2', 2024, 'YSMVSEK12RL000301', 'charcoal'],
    ];
    for (const v of vehicles) {
      this.db
        .prepare('INSERT INTO vehicles (id, owner_id, make, model, year, vin, color) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(...v);
    }

    // Service records: 1001+ on Alice's vehicle 101, 2001+ on Bob's 202.
    const records: Array<[number, number, string, string, number, string]> = [
      [1001, 101, 'Oil change and tire rotation', 'completed', 89.99, '2026-09-02'],
      [1002, 101, 'Annual inspection', 'scheduled', 45.0, '2026-10-01'],
      [2001, 202, 'Brake pad replacement', 'in_progress', 349.5, '2026-09-20'],
      [2002, 202, 'Software update', 'completed', 0, '2026-09-10'],
    ];
    for (const r of records) {
      this.db
        .prepare('INSERT INTO service_records (id, vehicle_id, description, status, cost, scheduled_for) VALUES (?, ?, ?, ?, ?, ?)')
        .run(...r);
    }

    // Invoices: 3001 on record 1001, 4001 on record 2001.
    const invoices: Array<[number, number, number, string, string]> = [
      [3001, 1001, 89.99, 'paid', '2026-09-15'],
      [4001, 2001, 349.5, 'pending', '2026-10-05'],
    ];
    for (const i of invoices) {
      this.db
        .prepare('INSERT INTO invoices (id, record_id, amount, status, due_date) VALUES (?, ?, ?, ?, ?)')
        .run(...i);
    }
  }

  getUserByEmail(email: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  }

  getUserById(id: number): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }

  createUser(email: string, name: string, password: string): UserRow {
    this.db
      .prepare('INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)')
      .run(email, name, hashPassword(password));
    return this.getUserByEmail(email)!;
  }

  listVehicles(ownerId?: number): VehicleRow[] {
    const rows = ownerId
      ? this.db.prepare('SELECT * FROM vehicles WHERE owner_id = ? ORDER BY id').all(ownerId)
      : this.db.prepare('SELECT * FROM vehicles ORDER BY id').all();
    return rows as unknown as VehicleRow[];
  }

  getVehicle(id: number): VehicleRow | undefined {
    return this.db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id) as VehicleRow | undefined;
  }

  insertVehicle(ownerId: number, make: string, model: string, year: number, color: string): VehicleRow {
    const vin = `JH4KA75${String(Math.floor(1000 + Math.random() * 9000))}PC00${Math.floor(10 + Math.random() * 89)}`;
    this.db
      .prepare('INSERT INTO vehicles (owner_id, make, model, year, color, vin) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ownerId, make, model, year, color, vin);
    return this.getVehicle(Number(this.db.prepare('SELECT last_insert_rowid() as id').get()!.id))!;
  }

  getServiceRecord(id: number): ServiceRecordRow | undefined {
    return this.db.prepare('SELECT * FROM service_records WHERE id = ?').get(id) as ServiceRecordRow | undefined;
  }

  listServiceRecords(vehicleIds: number[]): ServiceRecordRow[] {
    if (vehicleIds.length === 0) return [];
    const placeholders = vehicleIds.map(() => '?').join(',');
    return this.db
      .prepare(`SELECT * FROM service_records WHERE vehicle_id IN (${placeholders}) ORDER BY id`)
      .all(...vehicleIds) as unknown as ServiceRecordRow[];
  }

  insertServiceRecord(vehicleId: number, description: string, scheduledFor: string): ServiceRecordRow {
    this.db
      .prepare('INSERT INTO service_records (vehicle_id, description, status, scheduled_for) VALUES (?, ?, ?, ?)')
      .run(vehicleId, description, 'scheduled', scheduledFor);
    return this.getServiceRecord(Number(this.db.prepare('SELECT last_insert_rowid() as id').get()!.id))!;
  }

  getInvoice(id: number): InvoiceRow | undefined {
    return this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as InvoiceRow | undefined;
  }

  invoiceForRecord(recordId: number): InvoiceRow | undefined {
    return this.db.prepare('SELECT * FROM invoices WHERE record_id = ?').get(recordId) as InvoiceRow | undefined;
  }

  allInvoices(): InvoiceRow[] {
    return this.db.prepare('SELECT * FROM invoices ORDER BY id').all() as unknown as InvoiceRow[];
  }

  recordLoginFailure(email: string): void {
    this.db.prepare('UPDATE users SET failed_logins = failed_logins + 1 WHERE email = ?').run(email);
  }
}

export const db = new SandboxDB();
