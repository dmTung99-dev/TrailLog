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
