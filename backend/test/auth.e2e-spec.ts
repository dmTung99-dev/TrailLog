import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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
