import { prisma } from '../src/lib/prisma.js';
import { signUserToken } from '../src/utils/jwt.js';
import { generateDeviceToken } from '../src/utils/crypto.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const mode = process.argv[2];
  if (mode === 'verify') {
    const userId = process.argv[3];
    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { startTime: 'asc' },
    });
    console.log(`RESULT_JSON=${JSON.stringify(sessions)}`);
    await prisma.$disconnect();
    return;
  }

  // 1. Create or get Admin user
  let adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        email: 'admin.real@devsynx.com',
        fullName: 'System Administrator',
        role: 'ADMIN',
        isActive: true,
      },
    });
  }

  const adminToken = signUserToken({
    userId: adminUser.id,
    email: adminUser.email,
    role: adminUser.role,
  });

  // 2. Create test employee
  const timestamp = Date.now();
  const employee = await prisma.user.create({
    data: {
      email: `win_real_user_${timestamp}@devsynx.com`,
      fullName: 'Windows Real Device Tester',
      role: 'EMPLOYEE',
      isActive: true,
    },
  });

  // 3. Register device with hashed token
  const { rawToken, tokenHash } = generateDeviceToken();
  const device = await prisma.device.create({
    data: {
      hostname: 'REAL-WIN11-WORKSTATION',
      osType: 'WINDOWS',
      osVersion: 'Windows 11 Enterprise (23H2)',
      user: { connect: { id: employee.id } },
      deviceTokenHash: tokenHash,
      status: 'ACTIVE',
    },
  });

  const outData = {
    adminToken,
    employeeId: employee.id,
    deviceId: device.id,
    rawDeviceToken: rawToken,
  };

  const scratchDir = path.resolve('..', 'agent', 'scratch');
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }
  fs.writeFileSync(path.join(scratchDir, 'test_device_creds.json'), JSON.stringify(outData, null, 2));
  console.log('[SUCCESS] Real device created successfully:', outData.deviceId);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[ERROR] Failed to setup test device:', err);
  process.exit(1);
});
