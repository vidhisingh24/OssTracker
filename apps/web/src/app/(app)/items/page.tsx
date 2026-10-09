import { Suspense } from "react";
import { ItemsTable } from "./items-table";

export const metadata = { title: "All items" };

export default function Page() {
  return (
    <Suspense>
      <ItemsTable />
    </Suspense>
  );
}
