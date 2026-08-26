export { listDepartments, readDepartment, searchDepartments, DepartmentReadError } from './application/departmentReadModel';
export {
  createDepartment,
  updateDepartment,
  DepartmentMutationError,
  type DepartmentMutationErrorCode,
} from './application/manageDepartments';
export {
  deactivateDepartment,
  getDepartmentLifecycleSummary,
  reactivateDepartment,
  DepartmentLifecycleError,
  type DepartmentLifecycleErrorCode,
} from './application/manageDepartmentLifecycle';
