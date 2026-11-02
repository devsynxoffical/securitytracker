import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TaskStatusGroup, SpaceVisibility } from '@company-os/contracts';
import { ScopeFilter } from '../auth/guards/rbac.guard';

/** 14 rule 3: coarse status derived from the status group. */
export function statusFromGroup(group: string): 'todo' | 'in_progress' | 'done' | 'cancelled' {
  switch (group) {
    case TaskStatusGroup.ACTIVE:
      return 'in_progress';
    case TaskStatusGroup.DONE:
      return 'done';
    case TaskStatusGroup.CLOSED:
      return 'cancelled';
    default:
      return 'todo';
  }
}

export function groupFromLegacyStatus(status: string): string {
  switch (status) {
    case 'in_progress':
      return TaskStatusGroup.ACTIVE;
    case 'done':
      return TaskStatusGroup.DONE;
    case 'cancelled':
      return TaskStatusGroup.CLOSED;
    default:
      return TaskStatusGroup.OPEN;
  }
}

/** Spaces the caller may see (14 rule 1). */
export function spaceVisibilityWhere(employeeId: string, canManageSpaces: boolean): Prisma.TaskSpaceWhereInput {
  if (canManageSpaces) return {};
  return { OR: [{ visibility: SpaceVisibility.COMPANY }, { members: { some: { employeeId } } }] };
}

/**
 * 14 rule 6: a task is in scope when its creator or any assignee is in the caller's scope,
 * or the caller is a member of a private space containing it. Tasks in private spaces the
 * caller cannot see are excluded even for `all` scope unless the caller manages spaces.
 */
export function taskScopeWhere(scope: ScopeFilter, canManageSpaces: boolean): Prisma.TaskWhereInput {
  const me = scope.employeeId;
  const hidePrivate: Prisma.TaskWhereInput = canManageSpaces
    ? {}
    : {
        OR: [
          { listId: null },
          { list: { space: { visibility: SpaceVisibility.COMPANY } } },
          { list: { space: { members: { some: { employeeId: me } } } } },
        ],
      };
  if (scope.scope === 'all') return hidePrivate;
  const ids = scope.allowedEmployeeIds;
  return {
    AND: [
      hidePrivate,
      {
        OR: [
          { creatorId: { in: ids } },
          { assigneeId: { in: ids } },
          { assignees: { some: { employeeId: { in: ids } } } },
          { list: { space: { visibility: SpaceVisibility.PRIVATE, members: { some: { employeeId: me } } } } },
        ],
      },
    ],
  };
}

/** 14 rule 7: only an assignee, the creator or tasks.manage in scope can change the task. */
export function assertCanEdit(
  task: { creatorId: string; assigneeId: string; assignees: Array<{ employeeId: string }> },
  actorId: string,
  canManage: boolean,
): void {
  if (canManage) return;
  if (task.creatorId === actorId || task.assigneeId === actorId) return;
  if (task.assignees.some((a) => a.employeeId === actorId)) return;
  throw new ForbiddenException('Only an assignee, the creator or a manager can change this task');
}

export function assertEmployeesInScope(scope: ScopeFilter, employeeIds: string[]): void {
  if (scope.scope === 'all') return;
  const outside = employeeIds.filter((id) => !scope.allowedEmployeeIds.includes(id));
  if (outside.length) throw new ForbiddenException('One or more employees are outside your scope');
}
