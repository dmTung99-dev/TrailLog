import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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
