# TrailLog Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the NestJS + PostgreSQL backend that stores TrailLog activities, arbitrates sync conflicts, and serves checkpoint photos — testable end-to-end over HTTP with no mobile app involved.

**Architecture:** A single NestJS application with three feature modules (Auth, Activities, Storage) on top of PostgreSQL via Prisma. Every endpoint that reads or writes user data sits behind a JWT guard. Conflict resolution is `updatedAt`-based last-write-wins with an explicit 409 response when both sides changed since the client's last known state — no distributed-sync framework, just one deliberate comparison.

**Tech Stack:** NestJS 10, TypeScript (strict), Prisma 5 + PostgreSQL 15, `@nestjs/jwt` + `passport-jwt`, `class-validator`, Jest + Supertest.

## Global Constraints

- ORM is Prisma, not TypeORM — decided for this plan because Prisma's generated types remove a whole class of DTO/entity drift bugs and its migration workflow is simpler for a solo project. (Spec left this open; this plan closes it.)
- Node.js 20 LTS, NestJS 10.x, TypeScript strict mode (`"strict": true`).
- PostgreSQL 15, run locally via Docker Compose; no other datastore.
- Every endpoint that touches a user's own data is protected by JWT auth and must never return another user's data (verified by an explicit ownership test in Task 3).
- No social, payment, or route-discovery/enrichment features (spec non-goals) — do not add endpoints for any of these even if they seem convenient.
- Checkpoint photo storage sits behind a `StorageService` interface so the disk-backed implementation used here can later be swapped for S3 without touching callers.

---

### Task 1: Bare NestJS scaffold with a health check

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `nest-cli.json`
- Create: `src/main.ts`
- Create: `src/app.module.ts`
- Create: `src/app.controller.ts`
- Create: `test/jest-e2e.json`
- Test: `test/health.e2e-spec.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a bootable Nest app (`AppModule`) and a running HTTP server, which every later task's e2e tests attach to via `Test.createTestingModule({ imports: [AppModule] })`.

- [ ] **Step 1: Write the failing e2e test**

```typescript
// test/health.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns status ok', async () => {
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config test/jest-e2e.json`
Expected: FAIL — `Cannot find module '../src/app.module'` (nothing exists yet).

- [ ] **Step 3: Write the scaffold files**

```json
// package.json
{
  "name": "traillog-backend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start:dev": "nest start --watch",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "test": "jest",
    "test:e2e": "jest --config test/jest-e2e.json"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@prisma/client": "^5.19.0",
    "bcrypt": "^5.1.1",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@nestjs/testing": "^10.4.0",
    "@types/bcrypt": "^5.0.2",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.14.0",
    "@types/passport-jwt": "^4.0.1",
    "@types/supertest": "^6.0.2",
    "eslint": "^8.57.0",
    "jest": "^29.7.0",
    "prisma": "^5.19.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.5"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2021",
    "declaration": true,
    "outDir": "./dist",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

```json
// nest-cli.json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

```typescript
// src/app.controller.ts
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
```

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController],
})
export class AppModule {}
```

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

```json
// test/jest-e2e.json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: exits 0, `node_modules` created, no unresolved peer dependency errors.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest --config test/jest-e2e.json`
Expected: PASS — `Health (e2e) > GET /health returns status ok`.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json nest-cli.json src/main.ts src/app.module.ts src/app.controller.ts test/jest-e2e.json test/health.e2e-spec.ts
git commit -m "feat: scaffold NestJS app with a health check endpoint"
```

---

### Task 2: PostgreSQL + Prisma + Auth (register/login/JWT)

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `prisma/schema.prisma`
- Create: `src/prisma/prisma.service.ts`
- Create: `src/prisma/prisma.module.ts`
- Create: `src/auth/dto/register.dto.ts`
- Create: `src/auth/dto/login.dto.ts`
- Create: `src/auth/auth.service.ts`
- Create: `src/auth/auth.controller.ts`
- Create: `src/auth/jwt.strategy.ts`
- Create: `src/auth/jwt-auth.guard.ts`
- Create: `src/auth/auth.module.ts`
- Modify: `src/app.module.ts` (import `AuthModule`, `PrismaModule`)
- Test: `test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `AppModule` from Task 1.
- Produces: `PrismaService` (injectable, used by every later task that touches the database), `JwtAuthGuard` (used by Activities and Storage controllers to protect routes), and a `req.user` shape of `{ userId: string; email: string }` attached by `JwtStrategy.validate`.

- [ ] **Step 1: Write the failing e2e test**

```typescript
// test/auth.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  it('registers a new user and returns a JWT', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'trail@example.com', password: 'correct-horse-battery' });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('accessToken');
  });

  it('rejects registering the same email twice', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'dup@example.com', password: 'correct-horse-battery' });

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'dup@example.com', password: 'another-password' });

    expect(response.status).toBe(409);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'login@example.com', password: 'correct-horse-battery' });

    const good = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'correct-horse-battery' });
    expect(good.status).toBe(200);
    expect(good.body).toHaveProperty('accessToken');

    const bad = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'wrong-password' });
    expect(bad.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config test/jest-e2e.json auth`
Expected: FAIL — `Cannot find module '../src/prisma/prisma.service'`.

- [ ] **Step 3: Add Postgres + Prisma scaffolding**

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15
    restart: unless-stopped
    environment:
      POSTGRES_USER: traillog
      POSTGRES_PASSWORD: traillog
      POSTGRES_DB: traillog
    ports:
      - '5432:5432'
    volumes:
      - traillog-db:/var/lib/postgresql/data

volumes:
  traillog-db:
```

```
# .env.example
DATABASE_URL="postgresql://traillog:traillog@localhost:5432/traillog"
JWT_SECRET="replace-with-a-long-random-value"
```

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

```typescript
// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

```typescript
// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 4: Run migrations and generate the client**

Run: `cp .env.example .env && docker compose up -d postgres && npx prisma migrate dev --name init`
Expected: prints `Your database is now in sync with your schema` and generates `node_modules/@prisma/client`.

- [ ] **Step 5: Write the Auth module**

```typescript
// src/auth/dto/register.dto.ts
import { IsEmail, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;
}
```

```typescript
// src/auth/dto/login.dto.ts
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
```

```typescript
// src/auth/auth.service.ts
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, password: string): Promise<{ accessToken: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({ data: { email, passwordHash } });

    return { accessToken: this.signToken(user.id, user.email) };
  }

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return { accessToken: this.signToken(user.id, user.email) };
  }

  private signToken(userId: string, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }
}
```

```typescript
// src/auth/auth.controller.ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }
}
```

```typescript
// src/auth/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'replace-with-a-long-random-value',
    });
  }

  validate(payload: JwtPayload) {
    return { userId: payload.sub, email: payload.email };
  }
}
```

```typescript
// src/auth/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

```typescript
// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'replace-with-a-long-random-value',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtStrategy],
})
export class AuthModule {}
```

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest --config test/jest-e2e.json auth`
Expected: PASS — all three `Auth (e2e)` tests green.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml .env.example prisma/schema.prisma src/prisma src/auth src/app.module.ts test/auth.e2e-spec.ts
git commit -m "feat: add Postgres/Prisma and JWT-based register/login"
```

---

### Task 3: Activities module — CRUD with ownership checks

**Files:**
- Modify: `prisma/schema.prisma` (add `Activity`, `RoutePoint`, `Checkpoint`)
- Create: `src/activities/dto/create-activity.dto.ts`
- Create: `src/activities/activities.service.ts`
- Create: `src/activities/activities.controller.ts`
- Create: `src/activities/activities.module.ts`
- Modify: `src/app.module.ts` (import `ActivitiesModule`)
- Test: `test/activities.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `JwtAuthGuard`, `req.user.userId` from Task 2.
- Produces: `ActivitiesService.create/findAllForUser/findOneForUser/updateMetadata` — `updateMetadata`'s signature is fixed here and consumed unchanged by Task 4 (conflict resolution) and by Task 5 (checkpoint photo endpoint reuses `findOneForUser` for ownership checks).

- [ ] **Step 1: Write the failing e2e test**

```typescript
// test/activities.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function registerAndLogin(app: INestApplication, email: string) {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'correct-horse-battery' });
  return res.body.accessToken as string;
}

describe('Activities (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.activity.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  it('creates an activity with route points, then lists and fetches it', async () => {
    const token = await registerAndLogin(app, 'owner@example.com');

    const createRes = await request(app.getHttpServer())
      .post('/activities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Morning hike',
        startedAt: '2026-09-06T07:00:00.000Z',
        endedAt: '2026-09-06T08:00:00.000Z',
        routePoints: [
          { lat: 10.1, lng: 106.1, recordedAt: '2026-09-06T07:00:00.000Z', sequence: 0 },
          { lat: 10.2, lng: 106.2, recordedAt: '2026-09-06T07:30:00.000Z', sequence: 1 },
        ],
      });
    expect(createRes.status).toBe(201);
    const activityId = createRes.body.id;

    const listRes = await request(app.getHttpServer())
      .get('/activities')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);

    const getRes = await request(app.getHttpServer())
      .get(`/activities/${activityId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.routePoints).toHaveLength(2);
  });

  it('rejects requests without a token', async () => {
    const res = await request(app.getHttpServer()).get('/activities');
    expect(res.status).toBe(401);
  });

  it('does not let one user read another user\'s activity', async () => {
    const ownerToken = await registerAndLogin(app, 'owner2@example.com');
    const intruderToken = await registerAndLogin(app, 'intruder@example.com');

    const createRes = await request(app.getHttpServer())
      .post('/activities')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Private trail', startedAt: '2026-09-06T07:00:00.000Z', routePoints: [] });
    const activityId = createRes.body.id;

    const res = await request(app.getHttpServer())
      .get(`/activities/${activityId}`)
      .set('Authorization', `Bearer ${intruderToken}`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config test/jest-e2e.json activities`
Expected: FAIL — 404/`Cannot POST /activities` (route doesn't exist yet).

- [ ] **Step 3: Extend the Prisma schema**

```prisma
// prisma/schema.prisma (append)
model Activity {
  id         String       @id @default(uuid())
  userId     String
  title      String
  notes      String?
  visibility String       @default("private")
  startedAt  DateTime
  endedAt    DateTime?
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt
  routePoints RoutePoint[]
  checkpoints Checkpoint[]
}

model RoutePoint {
  id         String   @id @default(uuid())
  activityId String
  activity   Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  lat        Float
  lng        Float
  recordedAt DateTime
  sequence   Int
}

model Checkpoint {
  id         String   @id @default(uuid())
  activityId String
  activity   Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  lat        Float
  lng        Float
  capturedAt DateTime
  photoUrl   String?
}
```

Run: `npx prisma migrate dev --name add_activities`
Expected: prints `Your database is now in sync with your schema`.

- [ ] **Step 4: Write the DTO, service, and controller**

```typescript
// src/activities/dto/create-activity.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class RoutePointDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsDateString()
  recordedAt!: string;

  @IsNumber()
  sequence!: number;
}

export class CreateActivityDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsDateString()
  startedAt!: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutePointDto)
  routePoints!: RoutePointDto[];
}
```

```typescript
// src/activities/activities.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateActivityDto) {
    return this.prisma.activity.create({
      data: {
        userId,
        title: dto.title,
        notes: dto.notes,
        startedAt: new Date(dto.startedAt),
        endedAt: dto.endedAt ? new Date(dto.endedAt) : null,
        routePoints: { create: dto.routePoints.map((p) => ({ ...p, recordedAt: new Date(p.recordedAt) })) },
      },
      include: { routePoints: true, checkpoints: true },
    });
  }

  findAllForUser(userId: string) {
    return this.prisma.activity.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
    });
  }

  async findOneForUser(userId: string, activityId: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, userId },
      include: { routePoints: true, checkpoints: true },
    });
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    return activity;
  }
}
```

```typescript
// src/activities/activities.controller.ts
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';

interface AuthedRequest {
  user: { userId: string; email: string };
}

@UseGuards(JwtAuthGuard)
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateActivityDto) {
    return this.activitiesService.create(req.user.userId, dto);
  }

  @Get()
  findAll(@Req() req: AuthedRequest) {
    return this.activitiesService.findAllForUser(req.user.userId);
  }

  @Get(':id')
  findOne(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.activitiesService.findOneForUser(req.user.userId, id);
  }
}
```

```typescript
// src/activities/activities.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';

@Module({
  imports: [AuthModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
```

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ActivitiesModule } from './activities/activities.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ActivitiesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest --config test/jest-e2e.json activities`
Expected: PASS — all three `Activities (e2e)` tests green, including the cross-user 404 check.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/activities src/app.module.ts test/activities.e2e-spec.ts
git commit -m "feat: add Activities module with ownership-checked CRUD"
```

---

### Task 4: Conflict resolution for activity metadata updates

**Files:**
- Modify: `src/activities/activities.service.ts` (add `updateMetadata`)
- Modify: `src/activities/activities.controller.ts` (add `PATCH /activities/:id`)
- Modify: `src/activities/dto/create-activity.dto.ts` file directory — create sibling `src/activities/dto/update-activity.dto.ts`
- Test: `src/activities/activities.service.spec.ts` (unit test, no HTTP)

**Interfaces:**
- Consumes: `ActivitiesService.findOneForUser` from Task 3 (used internally to fetch the current row before comparing timestamps).
- Produces: `ActivitiesService.updateMetadata(userId, activityId, dto): Promise<{ status: 'updated'; activity: Activity } | { status: 'conflict'; serverActivity: Activity }>` — this exact discriminated-union shape is what the controller and, later, the mobile SyncEngine's conflict-handling branch will pattern-match on.

- [ ] **Step 1: Write the failing unit test**

```typescript
// src/activities/activities.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesService } from './activities.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ActivitiesService.updateMetadata', () => {
  let service: ActivitiesService;
  let prisma: {
    activity: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      activity: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ActivitiesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ActivitiesService);
  });

  it('applies the update when the client has the latest version', async () => {
    const serverUpdatedAt = new Date('2026-09-06T10:00:00.000Z');
    prisma.activity.findFirst.mockResolvedValue({ id: 'a1', userId: 'u1', updatedAt: serverUpdatedAt });
    prisma.activity.update.mockResolvedValue({ id: 'a1', title: 'New title', updatedAt: new Date() });

    const result = await service.updateMetadata('u1', 'a1', {
      title: 'New title',
      clientUpdatedAt: serverUpdatedAt.toISOString(),
    });

    expect(result.status).toBe('updated');
    expect(prisma.activity.update).toHaveBeenCalled();
  });

  it('returns a conflict when the server changed after the client last saw it', async () => {
    const serverUpdatedAt = new Date('2026-09-06T12:00:00.000Z');
    const staleClientTimestamp = new Date('2026-09-06T10:00:00.000Z');
    prisma.activity.findFirst.mockResolvedValue({ id: 'a1', userId: 'u1', updatedAt: serverUpdatedAt });

    const result = await service.updateMetadata('u1', 'a1', {
      title: 'New title',
      clientUpdatedAt: staleClientTimestamp.toISOString(),
    });

    expect(result.status).toBe('conflict');
    expect(prisma.activity.update).not.toHaveBeenCalled();
  });

  it('treats an equal timestamp as up to date, not a conflict', async () => {
    const serverUpdatedAt = new Date('2026-09-06T10:00:00.000Z');
    prisma.activity.findFirst.mockResolvedValue({ id: 'a1', userId: 'u1', updatedAt: serverUpdatedAt });
    prisma.activity.update.mockResolvedValue({ id: 'a1', title: 'New title', updatedAt: new Date() });

    const result = await service.updateMetadata('u1', 'a1', {
      title: 'New title',
      clientUpdatedAt: serverUpdatedAt.toISOString(),
    });

    expect(result.status).toBe('updated');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest activities.service.spec.ts`
Expected: FAIL — `service.updateMetadata is not a function`.

- [ ] **Step 3: Implement `updateMetadata`**

```typescript
// src/activities/dto/update-activity.dto.ts
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  visibility?: string;

  @IsDateString()
  clientUpdatedAt!: string;
}
```

```typescript
// src/activities/activities.service.ts (add to the class; NotFoundException already imported)
import { UpdateActivityDto } from './dto/update-activity.dto';
// ...inside ActivitiesService:

  async updateMetadata(userId: string, activityId: string, dto: UpdateActivityDto) {
    const current = await this.prisma.activity.findFirst({
      where: { id: activityId, userId },
    });
    if (!current) {
      throw new NotFoundException('Activity not found');
    }

    const clientSawAt = new Date(dto.clientUpdatedAt);
    if (current.updatedAt.getTime() > clientSawAt.getTime()) {
      return { status: 'conflict' as const, serverActivity: current };
    }

    const updated = await this.prisma.activity.update({
      where: { id: activityId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.visibility !== undefined && { visibility: dto.visibility }),
      },
    });

    return { status: 'updated' as const, activity: updated };
  }
```

```typescript
// src/activities/activities.controller.ts (add import + method)
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { UpdateActivityDto } from './dto/update-activity.dto';
// ...inside ActivitiesController:

  @Patch(':id')
  @HttpCode(200)
  async update(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: UpdateActivityDto) {
    const result = await this.activitiesService.updateMetadata(req.user.userId, id, dto);
    if (result.status === 'conflict') {
      return { conflict: true, serverActivity: result.serverActivity };
    }
    return result.activity;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest activities.service.spec.ts`
Expected: PASS — all three cases green.

- [ ] **Step 5: Commit**

```bash
git add src/activities
git commit -m "feat: add last-write-wins conflict detection to activity metadata updates"
```

---

### Task 5: Checkpoint photo storage

**Files:**
- Create: `src/storage/storage.service.ts` (interface + `LocalDiskStorageService`)
- Create: `src/storage/storage.module.ts`
- Modify: `src/activities/activities.controller.ts` (add photo upload endpoint)
- Modify: `src/activities/activities.module.ts` (import `StorageModule`)
- Test: `test/checkpoint-photo.e2e-spec.ts`

**Interfaces:**
- Consumes: `ActivitiesService.findOneForUser` (ownership check before allowing an upload) from Task 3, `PrismaService` from Task 2.
- Produces: `StorageService.save(buffer, filename): Promise<string>` — the interface a future `S3StorageService` implements to replace `LocalDiskStorageService` without touching the controller.

- [ ] **Step 1: Write the failing e2e test**

```typescript
// test/checkpoint-photo.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Checkpoint photo upload (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const uploadDir = path.join(os.tmpdir(), 'traillog-test-uploads');

  beforeAll(async () => {
    process.env.UPLOAD_DIR = uploadDir;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.activity.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  it('uploads a checkpoint photo and stores its URL', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'photo@example.com', password: 'correct-horse-battery' });
    const token = registerRes.body.accessToken;

    const activityRes = await request(app.getHttpServer())
      .post('/activities')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Trail with a view', startedAt: '2026-09-06T07:00:00.000Z', routePoints: [] });
    const activityId = activityRes.body.id;

    const checkpoint = await prisma.checkpoint.create({
      data: { activityId, lat: 10.1, lng: 106.1, capturedAt: new Date() },
    });

    const fakeImage = Buffer.from('fake-jpeg-bytes');
    const uploadRes = await request(app.getHttpServer())
      .post(`/activities/${activityId}/checkpoints/${checkpoint.id}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', fakeImage, 'checkpoint.jpg');

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.photoUrl).toContain(checkpoint.id);

    const stored = await prisma.checkpoint.findUnique({ where: { id: checkpoint.id } });
    expect(stored?.photoUrl).toBeTruthy();
    expect(fs.existsSync(path.join(uploadDir, path.basename(stored!.photoUrl!)))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config test/jest-e2e.json checkpoint-photo`
Expected: FAIL — `Cannot POST /activities/:id/checkpoints/:id/photo`.

- [ ] **Step 3: Implement `StorageService` and the upload endpoint**

```typescript
// src/storage/storage.service.ts
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface StorageService {
  save(buffer: Buffer, filename: string): Promise<string>;
}

@Injectable()
export class LocalDiskStorageService implements StorageService {
  private readonly uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');

  async save(buffer: Buffer, filename: string): Promise<string> {
    fs.mkdirSync(this.uploadDir, { recursive: true });
    const filePath = path.join(this.uploadDir, filename);
    fs.writeFileSync(filePath, buffer);
    return `/uploads/${filename}`;
  }
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
```

```typescript
// src/storage/storage.module.ts
import { Module } from '@nestjs/common';
import { LocalDiskStorageService, STORAGE_SERVICE } from './storage.service';

@Module({
  providers: [{ provide: STORAGE_SERVICE, useClass: LocalDiskStorageService }],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
```

```typescript
// src/activities/activities.controller.ts (add imports + endpoint)
import { Inject, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { NotFoundException } from '@nestjs/common';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
// ...inside ActivitiesController, add to the constructor:
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
  ) {}

  @Post(':activityId/checkpoints/:checkpointId/photo')
  @UseInterceptors(FileInterceptor('photo'))
  async uploadCheckpointPhoto(
    @Req() req: AuthedRequest,
    @Param('activityId') activityId: string,
    @Param('checkpointId') checkpointId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // Ownership check: 404s if the activity isn't this user's.
    await this.activitiesService.findOneForUser(req.user.userId, activityId);

    const checkpoint = await this.prisma.checkpoint.findFirst({
      where: { id: checkpointId, activityId },
    });
    if (!checkpoint) {
      throw new NotFoundException('Checkpoint not found');
    }

    const filename = `${checkpointId}-${Date.now()}.jpg`;
    const photoUrl = await this.storageService.save(file.buffer, filename);

    return this.prisma.checkpoint.update({
      where: { id: checkpointId },
      data: { photoUrl },
    });
  }
```

```typescript
// src/activities/activities.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
```

Note: `FileInterceptor('photo')` requires Multer's memory storage to populate `file.buffer` — add `MulterModule.register({ storage: memoryStorage() })` is not required for the default Express adapter's built-in Multer, but if `file.buffer` is undefined when this runs, register `MulterModule` from `@nestjs/platform-express` with `{ storage: memoryStorage() }` in `ActivitiesModule`'s imports and re-run the test.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config test/jest-e2e.json checkpoint-photo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage src/activities/activities.controller.ts src/activities/activities.module.ts test/checkpoint-photo.e2e-spec.ts
git commit -m "feat: add pluggable storage service and checkpoint photo upload"
```

---

### Task 6: CI pipeline

**Files:**
- Create: `.github/workflows/backend-ci.yml`

**Interfaces:**
- Consumes: `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` scripts from Task 1/2, and the Prisma migration workflow from Task 2.
- Produces: nothing consumed by later tasks — this is the last task in this plan.

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/backend-ci.yml
name: Backend CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: traillog
          POSTGRES_PASSWORD: traillog
          POSTGRES_DB: traillog
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://traillog:traillog@localhost:5432/traillog
      JWT_SECRET: ci-test-secret
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm run lint
      - run: npm run build
      - run: npm test
      - run: npm run test:e2e
```

- [ ] **Step 2: Verify locally before relying on CI**

Run: `npm run lint && npm run build && npm test && npm run test:e2e`
Expected: all four commands exit 0.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/backend-ci.yml
git commit -m "ci: run lint, build, and tests against a real Postgres service container"
```

---

## Self-Review Notes

- **Spec coverage:** Auth ✅ (Task 2), Activities CRUD ✅ (Task 3), conflict resolution ✅ (Task 4), checkpoint photo storage behind a pluggable interface ✅ (Task 5), CI ✅ (Task 6). Cross-device sync consumption of this API is out of scope here by design — it belongs to the mobile Auth & Sync plan.
- **Placeholder scan:** none found; the one caveat note in Task 5 (Multer memory storage) is a documented fallback with an exact fix, not a TODO.
- **Type consistency:** `updateMetadata`'s `{ status: 'updated' | 'conflict' }` shape is used identically in its unit test (Task 4) and its controller caller (Task 4); `STORAGE_SERVICE`/`StorageService` introduced in Task 5 are the only names the checkpoint-photo endpoint uses.
