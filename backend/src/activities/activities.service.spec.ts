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
