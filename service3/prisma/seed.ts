import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.user.deleteMany();
  console.log('Seeding database with users...');

  const usersData = [];
  for (let i = 0; i < 1000000; i++) {
    usersData.push({
      firstName: `FirstName${i + 1}`,
      lastName: `LastName${i + 1}`,
      age: Math.floor(Math.random() * 60 + 18),
      gender: i % 2 === 0 ? 'male' : 'female',
      problems: i % 10 === 0,
    });
  }

  await prisma.user.createMany({
    data: usersData,
  });

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
