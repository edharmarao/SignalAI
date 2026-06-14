import ORBLiveDashboard from "@/components/equity/ORBLiveDashboard";

export default function Page({ params }: { params: { id: string } }) {
  return <ORBLiveDashboard strategyId={params.id} />;
}
