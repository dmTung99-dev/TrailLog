import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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
