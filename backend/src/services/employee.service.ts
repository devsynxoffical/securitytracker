import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';
import { AuthenticatedUser } from '../middleware/auth.middleware.js';
import { StorageService, FileUploadInput } from './storage.service.js';

export interface UpdateSelfServiceProfileInput {
  avatarUrl?: string;
  bio?: string;
  responsibilities?: string;
  currentFocus?: string;
  workLinksJson?: string;
}

export interface UpdateAdminProfileInput {
  employeeId?: string;
  jobTitle?: string;
  department?: string;
  managerId?: string;
  status?: string;
  role?: string;
  joiningDate?: string;
}

export interface CreateWorkUpdateInput {
  projectId?: string;
  title: string;
  description: string;
  attachment?: FileUploadInput;
}

export class EmployeeService {
  /**
   * Lists employee directory with optional filters.
   */
  static async listEmployees(query: { search?: string; department?: string; status?: string }) {
    const where: any = {};

    if (query.department) {
      where.department = query.department;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search } },
        { email: { contains: query.search } },
        { jobTitle: { contains: query.search } },
      ];
    }

    const employees = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        fullName: true,
        employeeId: true,
        avatarUrl: true,
        jobTitle: true,
        department: true,
        role: true,
        status: true,
        isActive: true,
        joiningDate: true,
        manager: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        employeeSkills: {
          select: {
            skill: { select: { id: true, name: true, category: true } },
            proficiency: true,
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });

    return employees;
  }

  /**
   * Gets detailed employee profile by ID.
   * Authorization Check: Employee can view own, Manager can view direct reports, Admin can view all.
   */
  static async getEmployeeById(targetUserId: string, requester: AuthenticatedUser) {
    const employee = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        fullName: true,
        employeeId: true,
        avatarUrl: true,
        jobTitle: true,
        department: true,
        role: true,
        status: true,
        isActive: true,
        joiningDate: true,
        bio: true,
        responsibilities: true,
        currentFocus: true,
        workLinksJson: true,
        managerId: true,
        manager: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        directReports: {
          select: {
            id: true,
            fullName: true,
            email: true,
            jobTitle: true,
          },
        },
        employeeSkills: {
          select: {
            skill: { select: { id: true, name: true, category: true } },
            proficiency: true,
          },
        },
        projectMemberships: {
          select: {
            role: true,
            project: { select: { id: true, name: true, status: true } },
          },
        },
        workUpdates: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            createdAt: true,
            project: { select: { id: true, name: true } },
            attachments: {
              select: {
                id: true,
                originalName: true,
                mimeType: true,
                size: true,
              },
            },
          },
        },
      },
    });

    if (!employee) {
      throw ApiError.notFound('Employee profile not found');
    }

    // Manager Access Validation: Manager can view self or direct reports
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    const isSelf = requester.id === targetUserId;
    const isDirectReport = employee.managerId === requester.id;

    if (!isSelf && !isAdmin && requester.role === 'MANAGER' && !isDirectReport) {
      throw ApiError.forbidden('Managers can only view profiles of their direct reports');
    }

    return employee;
  }

  /**
   * Updates employee self-service profile fields.
   * Employees can ONLY edit: avatarUrl, bio, responsibilities, currentFocus, workLinksJson.
   */
  static async updateSelfServiceProfile(
    targetUserId: string,
    requester: AuthenticatedUser,
    data: UpdateSelfServiceProfileInput
  ) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    const isSelf = requester.id === targetUserId;

    if (!isSelf && !isAdmin) {
      throw ApiError.forbidden('You are not authorized to update another employee profile');
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
        ...(data.bio !== undefined && { bio: data.bio }),
        ...(data.responsibilities !== undefined && { responsibilities: data.responsibilities }),
        ...(data.currentFocus !== undefined && { currentFocus: data.currentFocus }),
        ...(data.workLinksJson !== undefined && { workLinksJson: data.workLinksJson }),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: requester.id,
        action: 'EMPLOYEE_PROFILE_UPDATED',
        targetEntity: `user:${targetUserId}`,
        detailsJson: JSON.stringify({ fieldsUpdated: Object.keys(data) }),
      },
    });

    return updated;
  }

  /**
   * Admin-only update of organizational/protected fields.
   */
  static async updateAdminProfile(
    targetUserId: string,
    requester: AuthenticatedUser,
    data: UpdateAdminProfileInput
  ) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    if (!isAdmin) {
      throw ApiError.forbidden('Only Administrators can modify organizational employee fields');
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(data.employeeId !== undefined && { employeeId: data.employeeId }),
        ...(data.jobTitle !== undefined && { jobTitle: data.jobTitle }),
        ...(data.department !== undefined && { department: data.department }),
        ...(data.managerId !== undefined && { managerId: data.managerId }),
        ...(data.status !== undefined && { status: data.status, isActive: data.status === 'ACTIVE' }),
        ...(data.role !== undefined && { role: data.role }),
        ...(data.joiningDate !== undefined && { joiningDate: new Date(data.joiningDate) }),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: requester.id,
        action: 'EMPLOYEE_ADMIN_UPDATED',
        targetEntity: `user:${targetUserId}`,
        detailsJson: JSON.stringify(data),
      },
    });

    return updated;
  }

  /**
   * Add or Remove employee skill.
   */
  static async addSkill(targetUserId: string, requester: AuthenticatedUser, skillName: string, proficiency?: string) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    const isSelf = requester.id === targetUserId;

    if (!isSelf && !isAdmin) {
      throw ApiError.forbidden('You are not authorized to modify skills for another employee');
    }

    let skill = await prisma.skill.findUnique({ where: { name: skillName } });
    if (!skill) {
      skill = await prisma.skill.create({ data: { name: skillName } });
    }

    const employeeSkill = await prisma.employeeSkill.upsert({
      where: {
        userId_skillId: { userId: targetUserId, skillId: skill.id },
      },
      update: { proficiency },
      create: {
        userId: targetUserId,
        skillId: skill.id,
        proficiency,
      },
      include: { skill: true },
    });

    return employeeSkill;
  }

  /**
   * Delete employee skill.
   */
  static async removeSkill(targetUserId: string, requester: AuthenticatedUser, skillId: string) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    const isSelf = requester.id === targetUserId;

    if (!isSelf && !isAdmin) {
      throw ApiError.forbidden('You are not authorized to modify skills for another employee');
    }

    await prisma.employeeSkill.deleteMany({
      where: { userId: targetUserId, skillId },
    });

    return { status: 'success', message: 'Skill removed' };
  }

  /**
   * Create work update with optional manual attachment.
   */
  static async createWorkUpdate(
    targetUserId: string,
    requester: AuthenticatedUser,
    data: CreateWorkUpdateInput
  ) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    const isSelf = requester.id === targetUserId;

    if (!isSelf && !isAdmin) {
      throw ApiError.forbidden('You can only post work updates for your own profile');
    }

    const workUpdate = await prisma.workUpdate.create({
      data: {
        userId: targetUserId,
        projectId: data.projectId || null,
        title: data.title,
        description: data.description,
      },
    });

    if (data.attachment) {
      const savedFile = await StorageService.saveAttachment(data.attachment);
      await prisma.attachment.create({
        data: {
          workUpdateId: workUpdate.id,
          originalName: savedFile.originalName,
          storedName: savedFile.storedName,
          mimeType: savedFile.mimeType,
          size: savedFile.size,
          storagePath: savedFile.storagePath,
        },
      });
    }

    return prisma.workUpdate.findUnique({
      where: { id: workUpdate.id },
      include: {
        project: { select: { id: true, name: true } },
        attachments: true,
      },
    });
  }

  /**
   * Delete work update.
   */
  static async deleteWorkUpdate(updateId: string, requester: AuthenticatedUser) {
    const update = await prisma.workUpdate.findUnique({ where: { id: updateId } });
    if (!update) {
      throw ApiError.notFound('Work update not found');
    }

    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    const isOwner = requester.id === update.userId;

    if (!isOwner && !isAdmin) {
      throw ApiError.forbidden('You can only delete your own work updates');
    }

    await prisma.workUpdate.delete({ where: { id: updateId } });
    return { status: 'success', message: 'Work update deleted' };
  }
}
