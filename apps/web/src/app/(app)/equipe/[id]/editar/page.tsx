import { EmployeeForm } from "@/features/employees/employee-form";

export default async function EditarFuncionarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EmployeeForm employeeId={id} />;
}
