import { ProposalView } from "@/features/budgets/proposal-view";

export default async function PropostaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ProposalView token={token} />;
}
