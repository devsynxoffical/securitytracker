import { PrismaClient } from '@prisma/client';
import { signUserToken } from '../../backend/src/utils/jwt.js';
import { generateDeviceToken } from '../../backend/src/utils/crypto.js';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  // 1. Create or get Admin user
  let adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        email: 'admin.qa@devsynx.com',
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
  const { rawToken, hashedToken } = generateDeviceToken();
  const device = await prisma.device.create({
    data: {
      hostname: 'REAL-WIN11-WORKSTATION',
      osType: 'WINDOWS',
      osVersion: 'Windows 11 Enterprise (23H2)',
      assignedUserId: employee.id,
      deviceTokenHash: hashedToken,
      status: 'ACTIVE',
    },
  });

  const outData = {
    adminToken,
    employeeId: employee.id,
    deviceId: device.id,
    rawDeviceToken: rawToken,
  };

  const scratchDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
  fs.writeFileSync(path.join(scratchDir, 'test_device_creds.json'), JSON.stringify(outData, null, 2));
  console.log('[SUCCESS] Device created successfully:', outData.deviceId);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[ERROR] Failed to setup test device:', err);
  process.exit(1);
});
