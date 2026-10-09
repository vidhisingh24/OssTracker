import { Suspense } from "react";
import { ReposView } from "./repos-view";

export const metadata = { title: "Repos" };

export default function Page() {
  return (
    <Suspense>
      <ReposView />
    </Suspense>
  );
}
