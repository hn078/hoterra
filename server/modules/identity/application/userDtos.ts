import { Prisma, Role } from '@prisma/client';

export const searchUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  jobTitle: true,
  role: true,
  department: {
    select: {
      id: true,
      name: true,
      code: true,
      color: true,
      isActive: true,
      deactivatedAt: true,
    },
  },
} satisfies Prisma.UserSelect;

type SearchUserRecord = Prisma.UserGetPayload<{ select: typeof searchUserSelect }>;

export interface SearchUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  role: Role;
  department: SearchUserRecord['department'];
}

/** Explicit allow-list: authentication material can never enter search JSON. */
export function toSearchUserDto(user: SearchUserRecord): SearchUserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    jobTitle: user.jobTitle,
    role: user.role,
    department: user.department,
  };
}
