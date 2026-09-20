import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { CreateCheckpointDto } from './dto/create-checkpoint.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

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

  async createCheckpoint(userId: string, activityId: string, dto: CreateCheckpointDto) {
    await this.findOneForUser(userId, activityId); // ownership check; 404s if not this user's
    return this.prisma.checkpoint.create({
      data: {
        activityId,
        lat: dto.lat,
        lng: dto.lng,
        capturedAt: new Date(dto.capturedAt),
      },
    });
  }
}
