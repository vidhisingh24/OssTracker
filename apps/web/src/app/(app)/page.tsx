import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Today" };

export default function Page() {
  return (
    <PageHeader
      title="Today"
      description="What needs you, what is waiting on others, and what changed."
    />
  );
}
