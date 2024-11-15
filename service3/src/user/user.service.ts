import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async resetUserProblems(): Promise<number> {
    const usersWithProblems = await this.prisma.user.count({
      where: { problems: true },
    });

    await this.prisma.user.updateMany({
      where: { problems: true },
      data: { problems: false },
    });

    return usersWithProblems;
  }
}
