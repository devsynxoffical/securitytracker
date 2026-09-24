import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding DEVSYNX database with sample employee CRM records...');

  // 1. Create Admin Manager
  const manager = await prisma.user.upsert({
    where: { email: 'sarah.manager@devsynx.com' },
    update: {},
    create: {
      email: 'sarah.manager@devsynx.com',
      fullName: 'Sarah Jenkins',
      employeeId: 'EMP-1001',
      jobTitle: 'Engineering Manager',
      department: 'Engineering',
      role: 'MANAGER',
      status: 'ACTIVE',
      bio: 'Leading engineering teams and architecture initiatives at DEVSYNX.',
      responsibilities: 'Oversee backend architecture, database resilience, and team mentoring.',
      currentFocus: 'Scaling activity tracker backend and local storage efficiency.',
    },
  });

  // 2. Create Design Lead
  const designer = await prisma.user.upsert({
    where: { email: 'alex.design@devsynx.com' },
    update: {},
    create: {
      email: 'alex.design@devsynx.com',
      fullName: 'Alex Morgan',
      employeeId: 'EMP-1002',
      jobTitle: 'Lead Product Designer',
      department: 'Design',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      managerId: manager.id,
      bio: 'Crafting intuitive UI/UX design systems and responsive web applications.',
      responsibilities: 'User interface design, accessibility standards, and design system components.',
      currentFocus: 'Redesigning employee CRM profile analytics dashboard.',
    },
  });

  // 3. Create Full Stack Developer
  const developer = await prisma.user.upsert({
    where: { email: 'john.dev@devsynx.com' },
    update: {},
    create: {
      email: 'john.dev@devsynx.com',
      fullName: 'John Doe',
      employeeId: 'EMP-1003',
      jobTitle: 'Senior Full Stack Engineer',
      department: 'Engineering',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      managerId: manager.id,
      bio: 'Specializing in React, TypeScript, Node.js REST APIs, and database architecture.',
      responsibilities: 'Full-stack application development, API integrations, and code reviews.',
      currentFocus: 'Phase 5 Employee CRM and file attachment storage module.',
    },
  });

  // 4. Create Skills
  const reactSkill = await prisma.skill.upsert({
    where: { name: 'React' },
    update: {},
    create: { name: 'React', category: 'Frontend' },
  });

  const tsSkill = await prisma.skill.upsert({
    where: { name: 'TypeScript' },
    update: {},
    create: { name: 'TypeScript', category: 'Language' },
  });

  const uiSkill = await prisma.skill.upsert({
    where: { name: 'UI/UX' },
    update: {},
    create: { name: 'UI/UX', category: 'Design' },
  });

  // Link Skills to Employees
  await prisma.employeeSkill.upsert({
    where: { userId_skillId: { userId: developer.id, skillId: reactSkill.id } },
    update: {},
    create: { userId: developer.id, skillId: reactSkill.id, proficiency: 'EXPERT' },
  });

  await prisma.employeeSkill.upsert({
    where: { userId_skillId: { userId: developer.id, skillId: tsSkill.id } },
    update: {},
    create: { userId: developer.id, skillId: tsSkill.id, proficiency: 'EXPERT' },
  });

  await prisma.employeeSkill.upsert({
    where: { userId_skillId: { userId: designer.id, skillId: uiSkill.id } },
    update: {},
    create: { userId: designer.id, skillId: uiSkill.id, proficiency: 'EXPERT' },
  });

  // 5. Create Sample Project
  const project = await prisma.project.create({
    data: {
      name: 'DEVSYNX Activity Tracker V1',
      description: 'Employee activity tracker and CRM profile management platform.',
      status: 'ACTIVE',
    },
  });

  // Link Project Members
  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: manager.id, role: 'LEAD' },
      { projectId: project.id, userId: developer.id, role: 'MEMBER' },
      { projectId: project.id, userId: designer.id, role: 'MEMBER' },
    ],
  });

  // 6. Create Work Updates
  await prisma.workUpdate.create({
    data: {
      userId: developer.id,
      projectId: project.id,
      title: 'Phase 5 Employee CRM Module Completed',
      description: 'Implemented Employee Directory, Profile Page, Skills management, and Work Updates feed.',
    },
  });

  await prisma.workUpdate.create({
    data: {
      userId: designer.id,
      projectId: project.id,
      title: 'UI/UX Component System Finalized',
      description: 'Designed dark theme card layouts and responsive tab navigation for employee profiles.',
    },
  });

  console.log('✅ Database successfully seeded with sample records!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
